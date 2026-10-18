# cgbdev-pi-toolkit

Base compartida de **Pi normal** para Windows (casa) y macOS (trabajo). Independiente de SDD.

## Incluido

- Paquete Pi local: extensiones, skills comunes, prompts y temas.
- Codemode integrado activado, conservando las herramientas existentes.
- Skill común `efficient-tools`.
- Setup multiplataforma con copia de seguridad y conservación de ajustes locales.
- Pruebas aisladas: no usan tus credenciales ni tu configuración real.

No se ha elegido ni instalado todavía una extensión de subagentes. Pi no trae subagentes de serie.

## Gestión desde cualquier sesión de Pi

Después de instalar el paquete y ejecutar `/reload`, usa:

| Comando | Comportamiento |
|---|---|
| `/toolkit` | Ayuda y subcomandos disponibles. |
| `/toolkit status` | Ruta, rama, cambios locales y commits por sincronizar; usa la referencia remota almacenada, sin conexión de red. |
| `/toolkit add FUENTE` | Confirma, registra una versión fija, aplica setup y reconcilia dependencias. No hace commit ni push. |
| `/toolkit sync` | Requiere main limpio, hace fetch, pide confirmación y avanza al commit revisado sin merge de conflictos. Ejecuta pruebas/setup y reconcilia dependencias. |
| `/toolkit publish` | Revisa rutas y posibles secretos, ejecuta pruebas, muestra diff, pide mensaje de commit y confirmación independiente para push. |
| `/toolkit doctor` | Ejecuta pruebas y comprueba versiones/configuración sin mostrar credenciales. |

Ejemplo de formato: `/toolkit add npm:@organizacion/plugin@1.2.3` (paquete ilustrativo, no real).
Usa versiones npm completas o commits/tags Git de versión, por ejemplo `git:github.com/org/repo@v1.2.3`.
La instalación/reconciliación afecta a **todos los paquetes declarados en ese Pi**, incluidos los locales, porque utiliza `pi update --extensions`.
Revisa y confía en el código antes de aceptar: los plugins pueden ejecutar programas.
La extensión resuelve su repositorio desde su propia ubicación, no desde el proyecto que estés trabajando.

`publish` solo gestiona main y el origin esperado `carlosYoko/cgbdev-pi-toolkit`.
No usa `git add .`, no fuerza pushes, no guarda cambios con stash ni resuelve conflictos.
Rechaza índices previamente preparados, rutas fuera del conjunto compartible, binarios, archivos grandes y enlaces simbólicos.
El escáner de secretos es orientativo: **debes revisar el diff y confirmar que no incluye información privada o de empresa**.
Un push rechazado/cancelado conserva el commit local; vuelve a ejecutar `publish` tras revisar el estado.
Si falla una instalación, puede quedar el manifiesto registrado y los ajustes aplicados; se informa del estado sin borrar nada automáticamente.
No hay recarga automática: usa `/reload` después de add/sync.

La skill común `toolkit-maintenance` explica este flujo al agente cuando se lo pides en lenguaje natural.
Los comandos slash los ejecuta el usuario; la skill no los invoca como si fueran herramientas.
Las operaciones con confirmación requieren interfaz interactiva o un cliente RPC que soporte diálogos.
Las pruebas de procesos usan repositorios temporales; no hacen instalaciones ni pushes reales.
GitHub Actions ejecuta las pruebas en Windows/macOS con Node 22/24 cuando se publique esta configuración.

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
