/**
 * ===========================================
 * MODELO DE DÍAS FESTIVOS (HOLIDAYS)
 * ===========================================
 *
 * Responsabilidades:
 * - Definir estructura de un día festivo
 * - Validar datos de festivos
 * - Mantener consistencia de datos
 *
 * Un día festivo representa una fecha en la que
 * el bot no debe responder mensajes automáticamente.
 */

/**
 * Clase Holiday
 * Representa un día festivo configurado
 */
class Holiday {
  constructor(data = {}) {
    this.id = data.id || null;                           // UUID único
    this.date = data.date || null;                       // Fecha en formato YYYY-MM-DD
    this.name = data.name || null;                       // Nombre del festivo (ej: "Navidad")
    this.description = data.description || null;         // Descripción opcional
    this.recurring = data.recurring !== undefined ? data.recurring : true; // Se repite anualmente
    this.active = data.active !== undefined ? data.active : true; // Está activo
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.createdBy = data.createdBy || 'system';         // Usuario que lo creó
  }

  /**
   * Crea un nuevo día festivo
   */
  static create(date, name, description = null, recurring = true) {
    const { v4: uuidv4 } = require('uuid');
    return new Holiday({
      id: uuidv4(),
      date,
      name,
      description,
      recurring,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Valida si la fecha está en el formato correcto (YYYY-MM-DD)
   */
  isValidDate() {
    if (!this.date) return false;

    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(this.date)) return false;

    const dateObj = new Date(this.date);
    return !isNaN(dateObj.getTime());
  }

  /**
   * Obtiene el año de la fecha
   */
  getYear() {
    if (!this.date) return null;
    return parseInt(this.date.substring(0, 4));
  }

  /**
   * Obtiene el mes de la fecha (1-12)
   */
  getMonth() {
    if (!this.date) return null;
    return parseInt(this.date.substring(5, 7));
  }

  /**
   * Obtiene el día de la fecha (1-31)
   */
  getDay() {
    if (!this.date) return null;
    return parseInt(this.date.substring(8, 10));
  }

  /**
   * Verifica si esta fecha coincide con una fecha dada
   * Si es recurrente, solo compara mes y día
   */
  matchesDate(compareDate) {
    if (!this.date || !compareDate) return false;

    const target = compareDate instanceof Date ? compareDate : new Date(compareDate);
    if (isNaN(target.getTime())) return false;

    const targetYear = target.getFullYear();
    const targetMonth = String(target.getMonth() + 1).padStart(2, '0');
    const targetDay = String(target.getDate()).padStart(2, '0');
    const targetDateStr = `${targetYear}-${targetMonth}-${targetDay}`;

    if (this.recurring) {
      // Comparar solo mes y día (ignorar año)
      const holidayMonth = this.date.substring(5, 7);
      const holidayDay = this.date.substring(8, 10);
      return holidayMonth === targetMonth && holidayDay === targetDay;
    } else {
      // Comparar fecha completa
      return this.date === targetDateStr;
    }
  }

  /**
   * Convierte a objeto plano
   */
  toObject() {
    return {
      id: this.id,
      date: this.date,
      name: this.name,
      description: this.description,
      recurring: this.recurring,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy
    };
  }

  /**
   * Convierte a formato para DynamoDB
   */
  toDynamoItem() {
    return {
      id: this.id,
      date: this.date,
      name: this.name,
      description: this.description || '',
      recurring: this.recurring,
      active: this.active,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
      createdBy: this.createdBy
    };
  }

  /**
   * Verifica si el festivo está activo
   */
  isActive() {
    return this.active === true;
  }

  /**
   * Activa el festivo
   */
  activate() {
    this.active = true;
    this.updatedAt = new Date();
  }

  /**
   * Desactiva el festivo
   */
  deactivate() {
    this.active = false;
    this.updatedAt = new Date();
  }
}

module.exports = { Holiday };
