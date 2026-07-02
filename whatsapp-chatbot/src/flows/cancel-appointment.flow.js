const BaseFlow = require("./base.flow");
const googleCalendarService = require("../services/google-calendar.service");
const logger = require("../utils/logger");

/**
 * ===========================================
 * FLUJO PARA VER Y CANCELAR CITAS
 * ===========================================
 *
 * Steps:
 *  1. list    -> Fetch upcoming events and show numbered list
 *  2. select  -> User picks a number; show event details + confirm
 *  3. confirm -> User says si/no; delete from Google Calendar if si
 */
class CancelAppointmentFlow extends BaseFlow {
  constructor(context) {
    super(context);
    this.steps = ["list", "select", "confirm"];
    this.data.events = [];
    this.data.selectedEvent = null;
    this.data.mode = context.mode || "cancel"; // "list" = solo ver, "cancel" = cancelar
  }

  // ─── STEP 1: Fetch events and show list ──────────────────────────────────
  async handleList(input) {
    logger.info(`[CancelAppointmentFlow] Fetching upcoming events for ${this.context.userId}`);

    try {
      const now = new Date();
      const inThreeMonths = new Date();
      inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);

      const events = await googleCalendarService.getEvents(
        now.toISOString(),
        inThreeMonths.toISOString()
      );

      const userPhone = this.context.userId ? this.context.userId.split('@')[0] : '';
      const userName = this.context.name ? this.context.name.toLowerCase() : '';

      // Filter only events that have a dateTime (not all-day) AND belong to this user
      const upcoming = (events || []).filter((e) => {
        if (!e.start || !(e.start.dateTime || e.start.date)) return false;
        
        const desc = (e.description || '').toLowerCase();
        const summary = (e.summary || '').toLowerCase();
        
        // 1. Match exact phone number (most reliable for new appointments)
        if (userPhone && (desc.includes(userPhone) || summary.includes(userPhone))) {
          return true;
        }
        
        // 2. Fallback: match WhatsApp pushName (for older appointments)
        if (userName && (desc.includes(userName) || summary.includes(userName))) {
          return true;
        }

        return false;
      });

      if (upcoming.length === 0) {
        const msg =
          this.data.mode === "list"
            ? "No tienes citas programadas en los proximos 3 meses. 📅\n\nSi quieres agendar una nueva cita, solo escribe *quiero una cita*."
            : "No tienes citas programadas en los proximos 3 meses. No hay nada que cancelar. 😊";
        return this.complete(msg);
      }

      this.data.events = upcoming;

      // Build numbered list
      let msg =
        this.data.mode === "list"
          ? "📅 *Tus proximas citas:*\n\n"
          : "📅 *Tus proximas citas:*\nEscribe el *numero* de la cita que deseas cancelar.\n\n";

      upcoming.forEach((ev, i) => {
        const dt = ev.start.dateTime || ev.start.date;
        const date = new Date(dt);
        const dateStr = date.toLocaleDateString("es-CO", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "America/Bogota",
        });
        const timeStr = ev.start.dateTime
          ? date.toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Bogota",
            })
          : "";
        const title = (ev.summary || "(sin titulo)").replace("Cita: ", "");
        msg += `*${i + 1}.* ${title}\n   📅 ${dateStr}${timeStr ? " a las " + timeStr : ""}\n\n`;
      });

      if (this.data.mode === "list") {
        // Just show the list and complete — include a hint to cancel
        const hint = "\n\n_Si deseas cancelar alguna, escribe *cancelar cita*._";
        return this.complete(msg.trim() + hint);
      }


      // Cancel mode: wait for user to pick a number
      msg += "Escribe el numero de la cita o *0* para no cancelar ninguna.";
      this.currentStepIndex++; // advance to 'select'
      return { message: msg.trim() };
    } catch (err) {
      logger.error("[CancelAppointmentFlow] Error fetching events:", err);
      return this.cancel(
        "Hubo un error al obtener tus citas. Por favor intenta mas tarde."
      );
    }
  }

  // ─── STEP 2: User selects which event to cancel ──────────────────────────
  async handleSelect(input) {
    const normalized = (input || "").trim();

    if (normalized === "0") {
      return this.cancel("De acuerdo, no se cancelara ninguna cita. Hasta luego! 👋");
    }

    const num = parseInt(normalized, 10);
    if (isNaN(num) || num < 1 || num > this.data.events.length) {
      return {
        message: `Por favor escribe un numero entre 1 y ${this.data.events.length}, o *0* para salir.`,
      };
    }

    const ev = this.data.events[num - 1];
    this.data.selectedEvent = ev;

    const dt = ev.start.dateTime || ev.start.date;
    const date = new Date(dt);
    const dateStr = date.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Bogota",
    });
    const timeStr = ev.start.dateTime
      ? date.toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Bogota",
        })
      : "";
    const title = (ev.summary || "(sin titulo)").replace("Cita: ", "");

    const msg =
      `Vas a cancelar esta cita:\n\n` +
      `📌 *${title}*\n` +
      `📅 ${dateStr}${timeStr ? " a las " + timeStr : ""}\n\n` +
      `Confirmas la cancelacion? Responde *si* para cancelar o *no* para conservar la cita.`;

    this.currentStepIndex++; // advance to 'confirm'
    return { message: msg };
  }

  // ─── STEP 3: Confirm cancellation ────────────────────────────────────────
  async handleConfirm(input) {
    const normalized = (input || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalized === "no") {
      return this.cancel(
        "De acuerdo, la cita *no* fue cancelada. Sigue en pie! 👍"
      );
    }

    if (normalized !== "si") {
      return {
        message:
          "Por favor responde *si* para confirmar la cancelacion o *no* para conservar la cita.",
      };
    }

    // Delete from Google Calendar
    try {
      await googleCalendarService.deleteEvent(this.data.selectedEvent.id);

      const dt = this.data.selectedEvent.start.dateTime || this.data.selectedEvent.start.date;
      const date = new Date(dt);
      const dateStr = date.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "America/Bogota",
      });
      const timeStr = this.data.selectedEvent.start.dateTime
        ? date.toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Bogota",
          })
        : "";

      logger.info(
        `[CancelAppointmentFlow] Event deleted: ${this.data.selectedEvent.id}`
      );

      return this.complete(
        `✅ Cita cancelada exitosamente.\n\n` +
          `La cita del *${dateStr}${timeStr ? " a las " + timeStr : ""}* ha sido eliminada del calendario.\n\n` +
          `Si deseas agendar una nueva cita, escribe *quiero una cita*. 📅`
      );
    } catch (err) {
      logger.error("[CancelAppointmentFlow] Error deleting event:", err);
      return this.cancel(
        "Hubo un error al cancelar la cita. Por favor contacta a un asesor o intenta mas tarde."
      );
    }
  }

  isCompleted() {
    return this.status === "completed" || this.status === "cancelled";
  }
}

module.exports = CancelAppointmentFlow;
