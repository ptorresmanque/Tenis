# Plataforma de gestión para FEDAL Tennis Center

Plataforma web de gestión integral para clubes de tenis y pádel con modelo de socios, desarrollada
como Trabajo de Título (INFO-1197) con FEDAL Tennis Center como caso de aplicación. Reúne en un solo
sistema la reserva de canchas, el cobro en línea, las cuotas de los socios, las clases, los torneos,
el ranking, el sitio público y el panel de administración del club.

## Tecnologías

| Capa | Tecnología |
| :--- | :--- |
| Aplicación web | Angular 22, Tailwind CSS 4 y tokens de diseño |
| Interfaz de programación | NestJS 11 sobre Node.js 22 |
| Persistencia | MariaDB con Prisma 7 y migraciones versionadas |
| Pagos | Webpay (Transbank) detrás del puerto `PasarelaPago` |
| Pruebas | Jest (API, integración contra base de datos real) y Vitest (web) |

## Estructura

```
apps/
  api/   Interfaz de programación NestJS, un módulo por subdominio:
         identidad, catalogo-canchas, reservas, pagos, cuotas, clases,
         torneos, ranking, reportes y salud. Esquema y migraciones en prisma/.
  web/   Aplicación de página única en Angular, con tres superficies:
         sitio público, socio y panel de administración.
```

El repositorio es un monorepo con npm workspaces. La documentación del Trabajo de Título, las
especificaciones de cada módulo y el plan de implementación se mantienen fuera del repositorio.

## Puesta en marcha

Requisitos: Node.js 22 o superior y MariaDB.

1. Instala las dependencias desde la raíz: `npm install`.
2. Copia `apps/api/.env.example` a `apps/api/.env` y completa las variables. El archivo de ejemplo
   documenta las bases de datos que hay que crear y el usuario que necesita Prisma.
3. Aplica las migraciones: `npx prisma migrate dev` dentro de `apps/api`.
4. Carga los datos de demostración: `npm run seed`.
5. Levanta la API y la aplicación web juntas: `npm run dev`. La web queda en
   `http://localhost:4200` y reenvía `/api` a la interfaz de programación.

`npm run dev` deja la API al día con el código antes de levantarla: regenera el cliente de Prisma
y aplica a la base de desarrollo las migraciones pendientes. Después de un `git pull` que trae
una migración no hace falta nada más; sin esto, la API no compilaba o respondía 500 por una
columna que la base no tenía.

Sin credenciales de Webpay, los pagos usan el ambiente de integración de Transbank con sus
credenciales públicas de prueba.

## Comandos

| Comando | Qué hace |
| :--- | :--- |
| `npm run dev` | Pone al día el cliente de Prisma y las migraciones, y levanta la API y la web |
| `npm test` | Ejecuta las pruebas de la API y de la web |
| `npm run lint` | Revisa el estilo de ambos proyectos |
| `npm run build` | Compila la API y la web para producción |
| `npm run seed` | Carga los datos de demostración |

Todo proceso de la API corre con `TZ=UTC`: los instantes se guardan en UTC y se presentan en la
zona `America/Santiago`. Los scripts ya lo incluyen.

## Historial y convenciones

- Los mensajes de commit se escriben en español y describen el efecto observable del cambio.
- Cada tarea del plan de implementación se identifica por su número: `T<n>: …`.
- Desde la tarea T36, la revisión de cada tarea queda como un commit aparte: `Revisión T<n>: …`.
- Las tareas se integran a `main` mediante commits de fusión (`Merge T<n>`).
