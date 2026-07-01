const BaseFlow = require('./base.flow');
const googleCalendarService = require('../services/google-calendar.service');
const logger = require('../utils/logger');
const chrono = require('chrono-node');

/**
 * ===========================================
 * FLUJO DE AGENDAMIENTO DE CITAS
 * ===========================================
 *
 * Steps:
 *  1. datetime  → Ask for date/time, parse with chrono-node
 *  2. confirm   → Show summary, wait for 'sí'/'no', create event in Google Calendar
 */
class AppointmentFlow extends BaseFlow {
  constructor(context) {
    super(context);
    // Flow steps
    this.steps = ['datetime', 'confirm'];
    // Client name (from WhatsApp profile or conversation)
    this.data.name = context.whatsappName || context.customName || 'Cliente';
    this.data.duration = 1; // 1 hour by default
  }

  // ─────────────────────────────────────────
  // STEP 1: Ask for date and time
  // ─────────────────────────────────────────
  async handleDatetime(input) {
    // Initial prompt — no input yet
    if (!input) {
      return {
        message: '¡Claro! Te ayudaré a agendar una cita.\n\n¿Para qué fecha y hora te gustaría agendar?\n_(Ej: mañana a las 3pm, el viernes a las 10:00, el próximo martes a las 11am)_'
      };
    }

    logger.info(`[AppointmentFlow] Parsing date input: "${input}"`);

    // Use chrono-node Spanish parser with a forward-looking reference date
    // Setting forwardDate=true ensures "martes" refers to NEXT Tuesday, not last Tuesday
    const parsedResults = chrono.es.parse(input, new Date(), { forwardDate: true });

    if (parsedResults.length === 0) {
      logger.warn(`[AppointmentFlow] Could not parse date from: "${input}"`);
      return {
        message: 'No pude entender la fecha y hora. ¿Podrías intentar de nuevo?\n_(Ej: mañana a las 15:00, el próximo lunes a las 10am, el martes 8 a las 2pm)_'
      };
    }

    let parsedDate = parsedResults[0].start.date();
    logger.info(`[AppointmentFlow] Parsed date: ${parsedDate.toISOString()}`);

    // Validate the date is in the future
    if (parsedDate < new Date()) {
      logger.warn(`[AppointmentFlow] Date is in the past: ${parsedDate.toISOString()}`);
      return {
        message: 'La fecha ingresada ya pasó. ¿Podrías darme una fecha futura?\n_(Ej: el próximo martes a las 11am)_'
      };
    }

    // Format for display (Colombia locale)
    const opcionesFecha = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' };
    const opcionesHora  = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' };
    this.data.fechaStr = parsedDate.toLocaleDateString('es-CO', opcionesFecha);
    this.data.horaStr  = parsedDate.toLocaleTimeString('es-CO', opcionesHora);

    // Build ISO parts in Bogotá local time
    // We use the original Date object's local values (server should be in America/Bogota
    // or we use the UTC offset stored in the parsed result)
    this.data.parsedDateIso = parsedDate.toISOString();

    const year  = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day   = String(parsedDate.getDate()).padStart(2, '0');
    const hrs   = String(parsedDate.getHours()).padStart(2, '0');
    const mins  = String(parsedDate.getMinutes()).padStart(2, '0');

    this.data.fechaIso = `${year}-${month}-${day}`;
    this.data.horaIso  = `${hrs}:${mins}`;

    logger.info(`[AppointmentFlow] Date stored → fecha: ${this.data.fechaIso}, hora: ${this.data.horaIso}`);

    // Advance to confirm step and show summary immediately
    this.currentStepIndex++;
    return this.executeCurrentStep(null, true);
  }

  // ─────────────────────────────────────────
  // STEP 2: Confirm and book in Google Calendar
  // ─────────────────────────────────────────
  async handleConfirm(input) {
    // Show appointment summary — waiting for user to confirm
    if (!input) {
      return {
        message:
          `📋 *Resumen de tu cita:*\n` +
          `👤 Nombre: ${this.data.name}\n` +
          `📅 Fecha: ${this.data.fechaStr}\n` +
          `⏰ Hora: ${this.data.horaStr}\n` +
          `⏱️ Duración: 1 hora\n\n` +
          `¿Confirmas la cita? Responde *sí* para agendar o *no* para cancelar.`
      };
    }

    const respuesta = input.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove accents

    // User cancels
    if (respuesta === 'no') {
      logger.info(`[AppointmentFlow] User cancelled appointment for ${this.context.userId}`);
      return this.cancel('La cita ha sido cancelada. Si necesitas agendar de nuevo, solo escríbeme cuando quieras. 😊');
    }

    // Not a valid yes/no
    if (respuesta !== 'si') {
      return {
        message: 'Por favor, responde *sí* para confirmar la cita, o *no* para cancelar.'
      };
    }

    // User confirmed — book in Google Calendar
    logger.info(`[AppointmentFlow] Booking appointment for ${this.context.userId}: ${this.data.fechaIso} ${this.data.horaIso}`);

    try {
      const result = await googleCalendarService.scheduleAppointment({
        nombre_cliente: this.data.name,
        fecha:          this.data.fechaIso,
        hora:           this.data.horaIso,
        duracion:       this.data.duration,
        descripcion:    `Cita agendada automáticamente vía WhatsApp para ${this.data.name}`
      });

      logger.info(`[AppointmentFlow] ✅ Event created: ${result.eventId} — ${result.link}`);

      return this.complete(
        `✅ *¡Tu cita ha sido agendada!*\n\n` +
        `👤 ${this.data.name}\n` +
        `📅 ${this.data.fechaStr}\n` +
        `⏰ ${this.data.horaStr}\n\n` +
        `Te esperamos. Si necesitas cancelar o cambiar la fecha, escríbenos con tiempo. 🙏`
      );

    } catch (error) {
      // Slot is already taken
      if (error.message && error.message.includes('CONFLICTO_HORARIO')) {
        logger.warn(`[AppointmentFlow] Time slot conflict for ${this.context.userId}`);
        // Go back to datetime step so user can pick another slot
        this.currentStepIndex = 0;
        return {
          message: 'Lo siento 😔, ese horario ya está ocupado.\n\nPor favor, elige otra fecha y hora.'
        };
      }

      logger.error('[AppointmentFlow] Error creating Google Calendar event:', error);
      return this.cancel(
        'Hubo un problema al agendar en el calendario 😔.\n\nPor favor intenta más tarde o comunícate directamente con nosotros.'
      );
    }
  }

  // Override isCompleted to match status set by BaseFlow.complete() / cancel()
  isCompleted() {
    return this.status === 'completed' || this.status === 'cancelled';
  }
}

module.exports = AppointmentFlow;
