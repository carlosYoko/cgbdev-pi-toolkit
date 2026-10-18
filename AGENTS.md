# Mantenimiento

Este repositorio contiene únicamente recursos compartibles de Pi normal.
No copiar auth.json, sesiones, rutas locales, configuraciones de empresa ni archivos de SDD.
Las skills específicas del equipo viven en ~/.pi/agent/skills o en proyectos, no aquí.
Usar rutas relativas y Node.js para scripts portables.
No modificar node_modules. Fijar versiones o commits de dependencias externas.
Ejecutar npm test y npm run check antes de aplicar cambios.
No hacer push automático ni incluir secretos en diagnósticos.
