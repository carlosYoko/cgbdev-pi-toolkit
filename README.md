# cgbdev-pi-toolkit

Base compartida de **Pi normal** para Windows y macOS. Independiente de SDD.

## Incluido

- Paquete Pi local: extensiones, skills comunes, prompts y temas.
- Ajustes UI compartidos validados; codemode es una herramienta incorporada de Pi, no un ajuste compartido.
- Skill común `efficient-tools`.
- Setup multiplataforma con copia de seguridad y conservación de ajustes locales.
- Pruebas aisladas: no usan tus credenciales ni tu configuración real.

Incluye agentes para la extensión de subagentes; el paquete/extensión se registra desde el toolkit. Los modelos sensibles se conservan locales.

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

Node.js >=22.19 y Pi instalado. Requiere Pi 1.5.2 o posterior.
Conviene mantener la misma versión de Pi en ambos equipos; el setup no la actualiza.

## Primera instalación

Clona este repositorio donde quieras. Desde su carpeta:

```sh
npm test
node scripts/setup.mjs --dry-run
npm run setup
```

El setup registra ESTA carpeta como paquete local en `<agent-dir>/settings.json`.
No copia recursos ni necesita enlaces simbólicos. No muevas la carpeta sin volver a ejecutar setup.
Respeta `PI_CODING_AGENT_DIR`; también admite `--agent-dir RUTA`. En Windows usa PowerShell o CMD con Node.js instalado; los comandos npm anteriores son multiplataforma.

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
Definiciones compartidas en `agents/` (planner, worker, fast-worker, reviewer, scout, researcher). Admiten `thinkingLevel` opcional (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), que prevalece sobre el nivel heredado de la sesión; niveles inválidos se ignoran. La extensión descubre primero estos agentes como fallback, después los de usuario y proyecto; estos últimos prevalecen si comparten nombre. No se copian agentes al directorio vivo. APPEND_SYSTEM.md se instala en el agent-dir durante setup, respaldando la versión previa; `--dry-run` y `--check` solo informan.
Codemode ya viene integrado: no se instala un paquete adicional.
No se comparten MCP ni endpoints: los archivos `mcp*.json`/auth son locales, incluidos los MCP lazy que requieren configuración por equipo. No se exportan modelos/endpoints corporativos de `models.json`.

### Coordinación e implementación

- `worker`: Sol 6.1 con razonamiento alto para implementación sustantiva.
- `fast-worker`: Luna 6 con razonamiento medio para cambios mecánicos explícitos.
- `reviewer`: Sol 6.1 con razonamiento alto.

`config/AGENTS.md` conserva las instrucciones globales de coordinación: menos delegaciones, validaciones sin duplicación y una sesión por ticket independiente. Para aplicarlas en otro equipo, copia su contenido a `<agent-dir>/AGENTS.md`, revisando y respaldando cualquier archivo existente. Setup no instala este archivo automáticamente. El `AGENTS.md` de la raíz contiene únicamente instrucciones de mantenimiento de este repositorio.

## Qué modifica setup

Solo añade paquetes compartidos, combina claves UI permitidas en settings.shared.json y actualiza APPEND_SYSTEM.md con copia previa.
Conserva modelo, proveedor, tema, credenciales, rutas y demás ajustes no declarados.
No toca `auth.json`, skills locales, sesiones, keybindings ni SDD.
Si cambia settings, guarda una copia en `<agent-dir>/toolkit-backups/`.
Los cambios directos en settings locales NO se exportan automáticamente al repo.

`npm run check` verifica que lo compartido esté aplicado, sin escribir.
`--dry-run` muestra un resumen de claves a cambiar, nunca los valores privados.

## Licencia

[MIT](LICENSE). Copyright (c) 2026 Carlos Gimenez.
La licencia cubre los archivos propios del repositorio; los plugins de terceros conservan sus licencias.
`private: true` en package.json evita publicar por accidente en npm; no determina la visibilidad en GitHub.
