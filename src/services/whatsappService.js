const twilio = require('twilio');

let client = null;
let configurado = false;

function inicializar() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.warn('⚠  WhatsApp no configurado (faltan credenciales Twilio)');
    return;
  }

  try {
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    configurado = true;
    console.log('💬 Servicio de WhatsApp listo');
  } catch (err) {
    console.error('❌ Error al inicializar Twilio:', err.message);
  }
}

function normalizarNumero(numero) {
  if (!numero) return null;

  let limpio = numero.replace(/[^\d+]/g, '');

  if (!limpio.startsWith('+')) {
    if (limpio.startsWith('57')) {
      limpio = '+' + limpio;
    } else {
      limpio = '+57' + limpio.replace(/^0+/, '');
    }
  }

  if (!/^\+\d{10,15}$/.test(limpio)) {
    return null;
  }

  return limpio;
}

async function enviarBienvenida(registro) {
  if (!configurado || !client) {
    return { enviado: false, error: 'WhatsApp no configurado' };
  }

  const numeroDestino = normalizarNumero(registro.whatsapp);
  if (!numeroDestino) {
    return { enviado: false, error: 'Número de WhatsApp inválido' };
  }
  try {
    const primerNombre = registro.nombre.split(' ')[0];

    const mensaje =
      `🌿 ¡Hola ${primerNombre}! Soy parte del equipo de *RaízViva*.\n\n` +
      `Recibimos tu registro y nos encantó tu perfil. En breve una de nuestras líderes se pondrá en contacto contigo.\n\n` +
      `Mientras tanto, puedes ir conociéndonos mejor:\n` +
      `💚 Instagram: @raizviva\n` +
      `🌸 WhatsApp comunidad: próximamente\n\n` +
      `¡Bienvenida a esta nueva etapa!\n\n` +
      `_RaízViva — Cultivamos liderazgos femeninos_`;

    const mensajeEnviado = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${numeroDestino}`,
      body: mensaje
    });

    console.log(`💬 WhatsApp bienvenida enviado a ${numeroDestino} (${mensajeEnviado.sid})`);
    return { enviado: true, sid: mensajeEnviado.sid };

  } catch (err) {
    console.error(`❌ Error al enviar WhatsApp a ${registro.whatsapp}:`, err.message);
    return { enviado: false, error: err.message };
  }
}

async function notificarAdmin(registro) {
  if (!configurado || !client || !process.env.WHATSAPP_ADMIN) {
    return { enviado: false, error: 'WhatsApp admin no configurado' };
  }

  try {
    const mensaje =
      `🌸 *Nueva vendedora registrada*\n\n` +
      `👤 ${registro.nombre}\n` +
      `📍 ${registro.ciudad} · ${registro.edad}\n` +
      `📧 ${registro.email}\n` +
      `📱 ${registro.whatsapp}\n` +
      `💼 ${registro.experiencia === 'Si' ? 'Con experiencia' : 'Sin experiencia'}\n` +
      `${registro.motivacion ? `\n💭 _"${registro.motivacion}"_\n` : ''}\n` +
      `Ver en el panel: ${process.env.APP_URL || ''}/admin.html`;

    const mensajeEnviado = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: process.env.WHATSAPP_ADMIN.startsWith('whatsapp:')
        ? process.env.WHATSAPP_ADMIN
        : `whatsapp:${normalizarNumero(process.env.WHATSAPP_ADMIN)}`,
      body: mensaje
    });

    console.log(`💬 WhatsApp admin enviado (${mensajeEnviado.sid})`);
    return { enviado: true, sid: mensajeEnviado.sid };

  } catch (err) {
    console.error('❌ Error al notificar admin por WhatsApp:', err.message);
    return { enviado: false, error: err.message };
  }
}

inicializar();

module.exports = { enviarBienvenida, notificarAdmin, normalizarNumero, estaConfigurado:
() => configurado };
