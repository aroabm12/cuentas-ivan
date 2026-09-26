# Mis Cuentas

Aplicación web sencilla para llevar tus movimientos de dinero (gastos e ingresos)
con saldo acumulado, guardado en una base de datos para que lo veas igual desde
el móvil y el ordenador.

## Cómo desplegarla en Vercel (paso a paso)

### 1. Sube este código a GitHub
1. Ve a github.com → **New repository** → ponle un nombre, por ejemplo `mis-cuentas`.
2. Sube estos archivos (arrastrando la carpeta descomprimida en la web de GitHub,
   o con `git push` si prefieres usar la terminal).

### 2. Importa el proyecto en Vercel
1. Entra en vercel.com → **Add New… → Project**.
2. Conecta tu cuenta de GitHub si no lo está ya, y selecciona el repositorio
   `mis-cuentas` que acabas de crear.
3. Deja la configuración por defecto (Vercel detecta que es Next.js solo) y
   pulsa **Deploy**. La primera vez fallará porque falta la base de datos — es
   normal, seguimos con el paso 3.

### 3. Conecta la base de datos (Neon Postgres, gratis)
1. Dentro de tu proyecto en Vercel, ve a la pestaña **Storage**.
2. Elige **Create Database** → busca **Neon** → **Continue**.
3. Sigue el asistente con los valores por defecto (plan gratuito) y pulsa
   **Create**. Vercel conecta automáticamente la base de datos a tu proyecto y
   crea la variable `DATABASE_URL` — no tienes que copiar ni pegar nada.

### 4. Vuelve a desplegar
1. Ve a la pestaña **Deployments** de tu proyecto.
2. En el último despliegue (el que falló), pulsa los tres puntos → **Redeploy**.
3. Cuando termine, abre el enlace que te da Vercel — ya tienes tu app funcionando.

### 5. (Opcional) Añádela a la pantalla de inicio del móvil
Abre el enlace en Safari o Chrome del móvil → menú → **Añadir a pantalla de
inicio**. Así la abres como si fuera una app normal.

## La primera vez que la abras

La primera vez que cargues la app, crea sola las tablas que necesita en la
base de datos y rellena tu lista de gastos fijos de partida — no hay que
ejecutar nada a mano.

Arriba del todo, donde pone "Tienes ahora mismo", pulsa **Corregir saldo de
partida** y pon tu saldo real de hoy (tarjeta + ahorro juntos).

## Qué incluye esta versión

- **Saldo actual**: tarjeta y ahorro juntos en un solo número.
- **Resumen del mes**: ingresos, gastos y ahorro real, comparado con tu meta
  de ahorro (editable, por defecto 450-500€) — en verde si la alcanzas, en
  rojo si no.
- **Gastos fijos de este mes**: lista con lo que ya has apuntado y lo que
  falta, con un botón para apuntarlo con un clic.
- **Movimientos**: el registro día a día, con saldo acumulado.
- **Gestión de gastos fijos**: puedes añadir, editar o borrar tus gastos
  fijos (importe, día del mes) directamente desde la app, sin tocar código.


## Desarrollo local (opcional, solo si quieres tocar el código)

```bash
npm install
cp .env.example .env.local
# pega tu DATABASE_URL de Neon en .env.local
npm run dev
```
