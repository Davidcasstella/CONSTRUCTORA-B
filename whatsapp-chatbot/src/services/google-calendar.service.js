const { google } = require('googleapis');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Service initialized at startup — restart server if .env changes
class GoogleCalendarService {
  constructor() {
    this.keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'google-service-account.json');
    // Trim to handle whitespace-only values like "GOOGLE_CALENDAR_ID= "
    const rawCalendarId = (process.env.GOOGLE_CALENDAR_ID || '').trim();
    this.calendarId = rawCalendarId || 'primary';
    this.timeZone = (process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Bogota').trim();
    this.calendar = null;
    this.initialized = false;

    logger.info(`[GoogleCalendarService] Config → calendarId: "${this.calendarId}", timeZone: "${this.timeZone}", keyFile: "${this.keyFilePath}"`);
    this.initAuth();
  }

  initAuth() {
    try {
      const base64Credentials = (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 || '').trim();

      let auth;

      if (base64Credentials) {
        // Priority: Use Base64-encoded credentials from env var (cloud/AWS deployment)
        const credentialsJson = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const credentials = JSON.parse(credentialsJson);

        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'],
        });

        logger.info('[GoogleCalendarService] Auth initialized from GOOGLE_SERVICE_ACCOUNT_BASE64 env var.');
      } else if (fs.existsSync(this.keyFilePath)) {
        // Fallback: Use JSON file on disk (local development)
        auth = new google.auth.GoogleAuth({
          keyFile: this.keyFilePath,
          scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'],
        });

        logger.info(`[GoogleCalendarService] Auth initialized from key file: ${this.keyFilePath}`);
      } else {
        logger.warn(`[GoogleCalendarService] No credentials found. Set GOOGLE_SERVICE_ACCOUNT_BASE64 env var or provide key file at ${this.keyFilePath}`);
        return;
      }

      this.calendar = google.calendar({ version: 'v3', auth });
      this.initialized = true;
      logger.info('[GoogleCalendarService] ✅ Service ready.');
    } catch (error) {
      logger.error('[GoogleCalendarService] Failed to initialize:', error);
    }
  }

  async checkAvailability(startTime, endTime) {
    if (!this.initialized) throw new Error('Servicio de Google Calendar no inicializado.');
    
    try {
      const response = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: new Date(startTime).toISOString(),
          timeMax: new Date(endTime).toISOString(),
          timeZone: this.timeZone,
          items: [{ id: this.calendarId }]
        }
      });

      const calendars = response.data.calendars;
      if (!calendars || !calendars[this.calendarId]) {
         throw new Error(`No se pudo verificar el calendario: ${this.calendarId}`);
      }

      const busySlots = calendars[this.calendarId].busy;
      return busySlots.length === 0;
    } catch (error) {
      logger.error(`Error validando disponibilidad en Google Calendar: ${error.message}`, error);
      throw new Error(`Error validando disponibilidad: ${error.message}`);
    }
  }

  async scheduleAppointment({ nombre_cliente, fecha, hora, duracion, descripcion }) {
    if (!this.initialized) throw new Error('Servicio de Google Calendar no inicializado.');

    try {
      // 1. Construir las fechas de inicio y fin (Asume formato ISO "YYYY-MM-DD" y "HH:mm")
      const startDateTime = new Date(`${fecha}T${hora}:00`);
      if (isNaN(startDateTime.getTime())) {
        throw new Error('Fecha u hora inválida');
      }

      const endDateTime = new Date(startDateTime.getTime() + (duracion * 60 * 60 * 1000));

      // 2. Validar disponibilidad
      const isAvailable = await this.checkAvailability(startDateTime, endDateTime);
      if (!isAvailable) {
        throw new Error('CONFLICTO_HORARIO: El horario seleccionado ya se encuentra ocupado.');
      }

      // 3. Crear el objeto del evento
      const event = {
        summary: `Cita: ${nombre_cliente}`,
        description: descripcion || `Cita agendada automáticamente para ${nombre_cliente}`,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: this.timeZone,
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: this.timeZone,
        },
      };

      // 4. Insertar en Google Calendar
      logger.info(`[GoogleCalendarService] Creating event on calendarId="${this.calendarId}"`, {
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime,
        timeZone: this.timeZone,
      });

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: event,
      });

      logger.info(`[GoogleCalendarService] ✅ Event created successfully: id=${response.data.id}, link=${response.data.htmlLink}`);

      return {
        success: true,
        eventId: response.data.id,
        link: response.data.htmlLink,
        message: 'Evento agendado exitosamente'
      };

    } catch (error) {
      logger.error('Error al agendar cita:', error);
      
      if (error.message && error.message.includes('CONFLICTO_HORARIO')) {
        throw error;
      }
      
      throw new Error(`Error interno al intentar crear el evento: ${error.message}`);
    }
  }

  async getEvents(timeMin, timeMax) {
    if (!this.initialized) throw new Error('Servicio de Google Calendar no inicializado');
    
    try {
      const response = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        timeZone: this.timeZone,
        singleEvents: true,
        orderBy: 'startTime'
      });
      return response.data.items;
    } catch (error) {
      logger.error('Error obteniendo eventos:', error);
      throw new Error('Error al obtener eventos de Google Calendar');
    }
  }

  async deleteEvent(eventId) {
    if (!this.initialized) throw new Error('Servicio de Google Calendar no inicializado');
    
    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: eventId
      });
      return true;
    } catch (error) {
      logger.error('Error eliminando evento:', error);
      throw new Error('Error al eliminar evento de Google Calendar');
    }
  }

  getConfig() {
    return {
      calendarId: this.calendarId,
      timeZone: this.timeZone,
      initialized: this.initialized
    };
  }

  async updateConfig(newCalendarId) {
    this.calendarId = newCalendarId;
    process.env.GOOGLE_CALENDAR_ID = newCalendarId;

    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      if (envContent.includes('GOOGLE_CALENDAR_ID=')) {
        envContent = envContent.replace(/GOOGLE_CALENDAR_ID=.*/g, `GOOGLE_CALENDAR_ID=${newCalendarId}`);
      } else {
        envContent += `\nGOOGLE_CALENDAR_ID=${newCalendarId}\n`;
      }
      
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
    
    this.initAuth(); // Re-initialize with new calendar ID validation if needed
    return this.getConfig();
  }
}

module.exports = new GoogleCalendarService();
