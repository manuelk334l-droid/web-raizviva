# RaízViva — Página para captar vendedoras

Landing + formulario de registro + backend (Node/Express) + base de datos PostgreSQL (Supabase) + panel admin con gráficas.

## Arranque
1. `npm install`
2. Copia `.env.example` a `.env` y completa DATABASE_URL (Supabase), SMTP y Twilio. Cambia `ADMIN_KEY` y genera `SESSION_SECRET` (el servidor no arranca sin él).
3. En Supabase > SQL Editor ejecuta `src/db/schema-vendedoras.sql` (una vez, ANTES de desplegar) y, opcional, `src/db/indexes.sql`. Luego `npm run migrate` para verificar.
4. `npm run dev` → http://localhost:3000  (admin: /admin · vendedoras: /vendedora)

## Estructura
- `public/` index.html (landing), unete.html (formulario por pasos), admin.html (panel + Analytics con Chart.js)
- `src/routes/` public.js (registro, health) y admin.js (registros, CSV, analytics; protegido con x-admin-key)
- `src/services/` registroService, emailService (Nodemailer), whatsappService (Twilio), analyticsService
- `src/db/` schema.sql, migrate.js, migrate-json.js, indexes.sql, pagos-futuro.sql (opcional)
- `templates/` correos de bienvenida y notificación al admin

## Panel de vendedoras
- Crear una vendedora: `npm run vendedoras -- crear "Valentina Rojas" valentina@correo.com` (entrega clave temporal y su link `/r/codigo`).
- Registrar una venta: `npm run vendedoras -- venta valentina@correo.com 250000 "Pedido #12"` (la comisión sale de `src/config/niveles.js`).
- Otros: `reset`, `anuncio`, `listar`. Los mismos servicios existen como API bajo `/api/admin/vendedoras`, `/api/admin/ventas` y `/api/admin/anuncios` (requieren clave de admin).
- Login propio (`/api/vendedora/login`), claves con scrypt, sesión firmada de 8 h, bloqueo tras 5 intentos fallidos y cambio de clave obligatorio en el primer ingreso.
- Cada vendedora solo ve sus datos; de sus referidas ve únicamente "Nombre I.", ciudad, fecha y estado.
- ⚠ Los niveles (Brote/Raíz/Bosque) y porcentajes de comisión de `niveles.js` son valores de ejemplo.
