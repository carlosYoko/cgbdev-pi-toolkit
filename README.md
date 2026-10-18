# cgbdev-pi-toolkit

Base compartida de **Pi normal** para Windows (casa) y macOS (trabajo). Independiente de SDD.

## Incluido

- Paquete Pi local: extensiones, skills comunes, prompts y temas.
- Codemode integrado activado, conservando las herramientas existentes.
- Skill común `efficient-tools`.
- Setup multiplataforma con copia de seguridad y conservación de ajustes locales.
- Pruebas aisladas: no usan tus credenciales ni tu configuración real.

No se ha elegido ni instalado todavía una extensión de subagentes. Pi no trae subagentes de serie.

## Requisitos

Node.js >=22.19 y Pi instalado. Base comprobada inicialmente con Pi 1.3.0.
Conviene mantener la misma versión de Pi en ambos equipos; el setup no la actualiza.

## Primera instalación

Clona este repositorio donde quieras. Desde su carpeta:

```sh
npm test
node scripts/setup.mjs --dry-run
npm run setup
```

El setup registra ESTA carpeta como paquete local en `~/.pi/agent/settings.json`.
No copia recursos ni necesita enlaces simbólicos. No muevas la carpeta sin volver a ejecutar setup.
Respeta `PI_CODING_AGENT_DIR`; también admite `--agent-dir RUTA`.

Haz login por separado en cada equipo. Después ejecuta `/reload` en Pi o reinícialo.
Usa `pi config` para activar/desactivar recursos. El setup conserva los filtros de tu paquete local.

## Sincronizar

```sh
git pull --ff-only
npm test
npm run setup
```

Revisa los cambios ANTES de aplicarlos. Tras modificar tus recursos: commit y push explícitos.
Instalar un plugin desde Pi no lo registra automáticamente en este repo.

## Paquetes externos

Declara las fuentes compartidas en `config/packages.json`, fijando versión npm o commit/tag Git.
Ejemplo de formato (no es un paquete real): `["npm:@organizacion/pi-plugin@1.2.3"]`.
Setup añade las fuentes, sin borrar paquetes locales ni filtros existentes.
Para instalar/reconciliar las dependencias declaradas, ejecuta después `pi update --extensions`.
Si quitas una fuente del manifiesto, retírala explícitamente en cada equipo con `pi remove FUENTE`;
setup no desinstala paquetes automáticamente.

## Tres capas de skills

- Comunes: `skills/common/<nombre>/SKILL.md`, versionadas aquí.
- Casa O trabajo: `~/.pi/agent/skills/<nombre>/SKILL.md`, solo locales o en sus repos propios.
- Proyecto: `.pi/skills/<nombre>/SKILL.md`, con la política de confianza del proyecto.

Las skills de trabajo nunca se copian aquí. Evita nombres duplicados.
Pi anuncia nombre y descripción; lee las instrucciones completas cuando hacen falta.
Invocación explícita: `/skill:efficient-tools`.
Prueba aislada: `pi --no-skills --skill ./skills/common/efficient-tools`.

## Extensiones y subagentes

Extensiones propias en `extensions/`; compartidas de terceros en `config/packages.json`.
Las definiciones de agentes se añadirán cuando se elija una extensión y su formato.
Codemode ya viene integrado: no se instala un paquete adicional.
No se comparten MCP corporativos ni credenciales. Los MCP locales se configuran por equipo.

## Qué modifica setup

Solo añade paquetes compartidos y combina las claves declaradas en settings.shared.json.
Conserva modelo, proveedor, tema, credenciales, rutas y demás ajustes no declarados.
No toca `auth.json`, skills locales, sesiones, keybindings ni SDD.
Si cambia settings, guarda una copia en `<agent-dir>/toolkit-backups/`.
Los cambios directos en settings locales NO se exportan automáticamente al repo.

`npm run check` verifica que lo compartido esté aplicado, sin escribir.
`--dry-run` muestra un resumen de claves a cambiar, nunca los valores privados.
