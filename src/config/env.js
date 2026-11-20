require('dotenv').config();

const requeridas = ['ADMIN_KEY'];
const opcionales = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_ADMIN',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'WHATSAPP_ADMIN'
];
function validar() {
  const faltantes = requeridas.filter(k => !process.env[k]);
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) faltantes.push('DATABASE_URL (o DB_HOST, DB_USER, DB_PASSWORD)');
  if (faltantes.length > 0) {
    console.error('❌ Variables de entorno faltantes:', faltantes.join(', '));
    process.exit(1);
  }

  const secreto = process.env.SESSION_SECRET || '';
  if (secreto.length < 32 || /^cambia/i.test(secreto)) {
    console.error('❌ SESSION_SECRET debe tener al menos 32 caracteres y no ser el valor de ejemplo.');
    console.error('   Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  const sinConfigurar = opcionales.filter(k => !process.env[k]);

  return {
    emailHabilitado: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    whatsappHabilitado: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
    sinConfigurar
  };
}

module.exports = { validar };

