---
name: toolkit-maintenance
description: Añadir o modificar plugins, extensiones, prompts y skills comunes de Pi y sincronizarlos entre equipos mediante cgbdev-pi-toolkit.
---

# Mantenimiento del toolkit de Pi

Este es el repositorio de Pi normal; nunca actuar sobre SDD.
La raíz del repositorio es tres niveles por encima de esta carpeta. Resuélvela desde la ruta real de esta skill, no desde el proyecto actual.

## Alcance

- Compartido: plugins, extensiones, codemode, prompts y skills comunes.
- Local: skills exclusivas de casa o trabajo, credenciales, modelos y rutas.
- Si el alcance no está claro, pregunta antes de registrar algo compartido.
- No leas ni copies auth.json, sesiones, tokens ni configuraciones corporativas.

## Comandos del usuario

La extensión registra /toolkit con estos subcomandos:
- status: estado local y referencia remota almacenada, sin fetch.
- add FUENTE: registrar un plugin con versión fijada, aplicar ajustes y reconciliar paquetes con confirmación.
- sync: fetch, revisión del resumen, avance rápido y aplicación; se detiene con cambios locales o divergencia.
- publish: pruebas, revisión de diff, commit y confirmación separada para push.
- doctor: comprobar configuración y ejecutar pruebas.

No simules que una herramienta puede invocar un comando slash: estos comandos los ejecuta el usuario.
Puedes editar los archivos correspondientes usando las herramientas de Pi y pedir después al usuario /toolkit publish.
Si el usuario pide que tú publiques, muestra diff, comprueba secretos y obtiene confirmación explícita antes de usar Git.
No uses git add . a ciegas. No hagas force push, stash, reset o resolución automática de conflictos.

## Añadir recursos

- Paquetes externos: config/packages.json; usa versiones npm exactas o referencias Git fijadas.
- Extensiones propias: extensions/.
- Skills compartidas: skills/common/<nombre>/SKILL.md.
- Prompts comunes: prompts/.
- Skills locales: fuera del repositorio, en ~/.pi/agent/skills o en .pi/skills del proyecto.
- No declares una instalación correcta hasta que se recargue Pi y se compruebe el recurso.

## Verificación

Desde la raíz: node --test y node scripts/setup.mjs --check.
No ejecutes scripts de cambios remotos sin revisarlos y recibir autorización.
Las pruebas y el escáner de secretos reducen riesgos, pero no garantizan que una extensión sea segura.
La actualización de Pi es independiente; sync no cambia su versión.
