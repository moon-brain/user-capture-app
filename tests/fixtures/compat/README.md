# Muestras de compatibilidad

Proyectos (`project/`) y preferencias (`userData/config.json`,
`recent-projects.json`) **escritos por versiones publicadas**, no por el
código actual. `tests/unit/main/compatibility.test.js` los abre con el código
de hoy y comprueba que todo sigue ahí: usuarios, enlaces, pagos, etiquetas,
ajustes, copias de enlaces, preferencias y una actualización del XML.

| Carpeta   | Por qué esa versión |
|-----------|---------------------|
| `v1.6.0`  | La de los proyectos del curso 2025-26 (la última antes de septiembre de 2026). Sin `image_linked_at`, NIA sin los ceros de delante, el precio del recibo como texto y ninguno de los ajustes posteriores |
| `v1.24.1` | La que tienen todas las instalaciones el 2026-10-31 |

`generated.json` dice qué versión lo escribió, dónde se creó (las rutas
absolutas que guarda el proyecto) y qué pasos se saltaron porque esa versión
no los tenía.

## Ábrelas siempre en una copia

Una base de datos en modo WAL deja `users.db-wal` y `users.db-shm` al abrirla,
aunque sea solo para leer. Abre una copia (como hace el test), nunca la
muestra: el test comprueba que `data/` solo tiene `users.db`.

## No se regeneran nunca

Son lo que hay en los discos del centro. Si un cambio hace fallar el test, lo
que se corrige es el cambio, para que siga leyendo lo que escribían las
versiones anteriores (clave nueva con valor por defecto, columna nueva con
`ALTER TABLE`...), no la muestra.

## Añadir la de una versión nueva

Cuando cambie el esquema de la base de datos o las claves de `config.json`
o `project_settings`, se añade la muestra de la **última versión publicada**
antes del cambio:

```sh
git worktree add --detach ../wt-1.30.0 v1.30.0
# Desde la 1.25 la base de datos es node:sqlite, que viene con Node: valen
# los node_modules de ahora. Las de la 1.24.1 o anteriores usan el paquete
# sqlite3, que ya no está: para ellas, npm ci en el worktree (con su script
# de instalación aprobado)
New-Item -ItemType Junction -Path ../wt-1.30.0/node_modules -Target ./node_modules
node tests/fixtures/compat/generate.cjs ../wt-1.30.0 tests/fixtures/compat/v1.30.0 D:\EduCapture-compat\v1.30.0
```

Después se añade su columna a `VERSIONS` en el test, con lo que esa versión
escribe distinto, y se quitan el worktree y su enlace: primero el enlace
(`(Get-Item ../wt-1.30.0/node_modules).Delete()`, que no toca el destino) y
luego `git worktree remove ../wt-1.30.0`.

`generate.cjs` pasa por los manejadores IPC y las funciones de configuración
de esa versión, como lo haría la ventana, y se salta lo que esa versión no
tiene. Lo que escribe `main.js` por su cuenta (cámara, visor aparte, fuente de
las miniaturas) lo reproduce solo si el `main.js` de esa versión lo escribe.
