const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let transporter = null;
let configurado = false;

function inicializar() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠  Email no configurado (faltan credenciales SMTP)');
    return;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  transporter.verify((err) => {
    if (err) {
      console.error('❌ Error al verificar SMTP:', err.message);
    } else {
      console.log('📧 Servicio de email listo');
      configurado = true;
    }
  });
}

function cargarTemplate(nombre, variables) {
  const ruta = path.join(__dirname, '..', '..', 'templates', nombre);
  let html = fs.readFileSync(ruta, 'utf-8');

  Object.entries(variables).forEach(([clave, valor]) => {
    const regex = new RegExp(`{{${clave}}}`, 'g');
    html = html.replace(regex, valor ?? '');
  });
  return html;
}

async function enviarBienvenida(registro) {
  if (!configurado || !transporter) {
    return { enviado: false, error: 'Email no configurado' };
  }

  try {
    const html = cargarTemplate('bienvenida.html', {
      nombre: registro.nombre,
      email: registro.email,
      ciudad: registro.ciudad,
      appUrl: process.env.APP_URL || 'http://localhost:3000'
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"RaízViva" <no-reply@raizviva.com>',
      to: registro.email,
      subject: `🌿 ¡Bienvenida a RaízViva, ${registro.nombre.split(' ')[0]}!`,
      html
    });

    console.log(`📧 Email de bienvenida enviado a ${registro.email} (${info.messageId})`);
    return { enviado: true, messageId: info.messageId };

  } catch (err) {
    console.error(`❌ Error al enviar email a ${registro.email}:`, err.message);
    return { enviado: false, error: err.message };
  }
}

async function notificarAdmin(registro) {
  if (!configurado || !transporter || !process.env.EMAIL_ADMIN) {
    return { enviado: false, error: 'Email admin no configurado' };
  }

  try {
    const html = cargarTemplate('notificacion-admin.html', {
      nombre: registro.nombre,
      email: registro.email,
      whatsapp: registro.whatsapp,
      ciudad: registro.ciudad,
      edad: registro.edad,
      experiencia: registro.experiencia === 'Si' ? 'Con experiencia' : 'Sin experiencia',      motivacion: registro.motivacion || 'No especificada',
      fecha: new Date(registro.fecha).toLocaleString('es-CO'),
      adminUrl: `${process.env.APP_URL || 'http://localhost:3000'}/admin.html`
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_ADMIN,
      subject: `🌸 Nueva vendedora registrada: ${registro.nombre}`,
      html
    });

    console.log(`📧 Notificación admin enviada (${info.messageId})`);
    return { enviado: true, messageId: info.messageId };

  } catch (err) {
    console.error('❌ Error al notificar admin:', err.message);
    return { enviado: false, error: err.message };
  }
}

inicializar();

module.exports = { enviarBienvenida, notificarAdmin, estaConfigurado: () => configurado
};
