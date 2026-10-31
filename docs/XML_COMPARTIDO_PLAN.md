# XML del centro compartido por el depósito

Estado: **plan, sin implementar**. Decisiones tomadas el 2026-10-31.

## 1. Problema

Cada instalación tiene su propio proyecto y cada equipo actualiza el XML del
suyo. Si no se actualizan todos a la vez, los proyectos que se usan al mismo
tiempo dejan de coincidir:

- un alumno nuevo no existe en un equipo y no se le puede enlazar la foto;
- un cambio de grupo exporta las fotos a la carpeta del grupo antiguo y saca
  el carnet con el grupo antiguo;
- las bajas solo pasan a «Eliminados» en el equipo que actualizó;
- las solicitudes de carnet salen como «fuera del proyecto» en unos equipos y
  en otros no.

Un proyecto mezcla dos clases de datos:

| Dato | Origen | ¿Común? |
|---|---|---|
| Usuarios, grupos, NIA, documento, curso | el XML | **sí**, es dato de referencia del centro |
| Foto enlazada (`image_path`, `image_linked_at`), etiquetas, `orla_paid`, `receipt_printed` | el trabajo de cada equipo | no |

**Lo que se comparte es el origen (el XML), no el estado (el `.sqlite`).** La
base de datos sigue siendo local. Compartirla por Drive no es una opción:
SQLite necesita bloqueos de archivo que los clientes de sincronización no
respetan, y dos equipos escribiendo a la vez la corromperían.

## 2. Decisiones

- **Publica quien actualice.** No hay un equipo con autoridad: el último XML
  publicado es el vigente, y queda anotado quién lo publicó.
- **Normalmente todos los proyectos son del mismo curso**, pero tiene que
  poder abrirse un proyecto de un curso anterior. A ese proyecto no se le
  ofrece el XML de otro curso.
- **Todos los equipos con la aplicación tienen acceso a la carpeta de Drive**
  (son todos del equipo directivo). Se publica el XML completo, sin recortar
  campos.
- **No se aplica nada automáticamente.** La aplicación avisa y la persona
  decide, con el mismo análisis de cambios de **Proyecto > Actualizar XML**.
  Una actualización mueve gente a «Eliminados»; no puede ocurrir sin que nadie
  la vea.
- **Nada se borra ni se mueve en el depósito**, como en `Reemplazadas` y en
  las solicitudes. Los XML anteriores quedan como historial.

## 3. Diseño

### 3.1 Qué se publica y dónde

- Carpeta `Centro/` en la raíz del depósito. El nombre es genérico a
  propósito, para que sirva en otros centros.
- Un archivo por publicación: `centro_<AAAAMMDDHHMMSS>_<equipo>.xml`, con el
  equipo sacado del nombre del equipo (`os.hostname()`) igual que en las
  ejecuciones de `Reemplazadas`. El curso no va en el nombre: se lee del XML
  (`<centro curso>`, `parseAcademicYear()`).
- Se escribe con nombre temporal y se renombra, para que ningún otro equipo
  lea un archivo a medio copiar. Al leer, `xmlParser` ya valida antes de
  analizar, porque Drive puede entregar un archivo a medias.
- La identidad de un XML es el **SHA-256 de su contenido**, no el nombre ni la
  fecha. Así no se publica dos veces el mismo XML y un equipo que aplica el
  XML publicado no lo vuelve a publicar (sin esto, cada equipo republicaría lo
  que acaba de recibir).

### 3.2 Cuándo se publica

- Al terminar bien `confirm-update-xml` y al crear un proyecto, **si hay
  depósito configurado y disponible** y si ese hash no está ya en `Centro/`.
- Si el depósito no está disponible, se actualiza igual y se avisa de que no
  se ha publicado. La publicación nunca impide actualizar.

### 3.3 Cómo se entera cada equipo

- `project_settings` guarda bajo `sharedXml` el último XML aplicado o
  publicado: `{ hash, fileName, appliedAt }`. Sin la clave (proyectos
  anteriores), no se ha aplicado ninguno.
- Se mira `Centro/` **al abrir el proyecto y al recuperar el foco la
  ventana**, como mucho una vez por minuto. Es un `readdir` de una carpeta
  pequeña. No se añade otro vigilante sobre Drive.
- Candidato: el más reciente por la marca del nombre **entre los del mismo
  curso que el proyecto** y con hash distinto del aplicado.

### 3.4 Qué ve la persona

| Situación | Qué hace la aplicación |
|---|---|
| Hay un XML más reciente del mismo curso | Aviso discreto, no un diálogo: «Hay un XML del centro más reciente, publicado por *equipo* el *fecha*». Botón **Actualizar...** que abre el análisis de cambios con ese archivo |
| Solo hay XML de otro curso | Nada. Es el caso de abrir a propósito un proyecto de un curso anterior |
| Lo local es igual a lo publicado | Nada |
| No hay depósito o no está disponible | Nada (ya hay avisos propios del depósito) |

**Proyecto > Información del proyecto** muestra el XML aplicado: fecha, quién
lo publicó y si hay uno más reciente.

## 4. Convivencia de versiones durante la transición

**Las versiones ya instaladas no ven `Centro/` y no se rompen.** Comprobado
en el código de la 1.24.1: la copia local del depósito solo lista archivos
`.jpg`/`.jpeg` del primer nivel (`repositoryMirror.js`, los cuatro `readdir`
del depósito y de la copia), y las solicitudes solo leen sus propias
carpetas. Una subcarpeta nueva con `.xml` les es invisible.

Lo que sí ocurre mientras convivan: un equipo con una versión antigua
actualiza su XML **sin publicarlo**, y los demás no se enteran. La transición
termina cuando todos los equipos tengan la versión nueva (ver 5.1), y hasta
entonces no hay que dar por hecho que `Centro/` está al día.

## 5. Garantías para las instalaciones desplegadas

Requisito: al acabar este trabajo, las versiones instaladas hoy tienen que
seguir funcionando y actualizarse con normalidad a la nueva.

### 5.1 Comprobaciones antes de publicar nada de esto

1. **Inventario de versiones.** ✅ 2026-10-31: todas las instalaciones tienen
   la 1.24.1, la última publicada. El actualizador existe desde la 1.7.0; una
   instalación anterior habría que actualizarla a mano.
2. **La redirección del repositorio.** Las instalaciones de la 1.24.0 o
   anteriores llevan grabado `vicpiri/user-capture-app` en su
   `app-update.yml` y dependen de que GitHub redirija a
   `moon-brain/user-capture-app`. ✅ Ya no afecta: con todas en la 1.24.1,
   todas preguntan directamente a `moon-brain`. Solo volvería a importar si
   apareciera una instalación de la 1.24.0 o anterior, que habría que
   comprobar o actualizar a mano.
3. **Saltos de varias versiones.** Un equipo puede pasar de cualquier versión
   a la última sin las intermedias. Las migraciones tienen que funcionar
   desde cualquier estado anterior. Hoy lo cumplen (`ALTER TABLE` por columna
   con su comprobación, claves de `config.json` y `project_settings` con
   valor por defecto), y tiene que seguir siendo así.

### 5.2 Invariantes que no se tocan

- `build.appId` (`com.eduusercaptureapp.app`) y `build.productName`
  (`Edu User Capture`): con otro valor, el instalador nuevo se instalaría al
  lado del antiguo y con otra carpeta de datos (`config.json`, recientes,
  miniaturas).
- `build.publish` apuntando a `moon-brain/user-capture-app`, con
  `releaseType: release`, y `latest.yml` en cada Release.
- No crear nunca un repositorio `vicpiri/user-capture-app`: rompería la
  redirección.

### 5.3 Tests de compatibilidad con proyectos reales

Para que la garantía no dependa de la memoria de nadie:

- `tests/fixtures/compat/` con un proyecto (`data/*.sqlite` con usuarios,
  fotos enlazadas, pagos y etiquetas) y un `config.json` **creados por la
  1.24.1**, la versión desplegada hoy. Si se puede, también uno de la 1.7.0,
  generado desde ese tag en un `git worktree`.
- Un test que, con el código actual, abre esos proyectos, lista los usuarios,
  aplica una actualización de XML y comprueba que se conservan enlaces,
  pagos y etiquetas.
- Los fixtures no se regeneran nunca. Cuando cambie el esquema se añade uno
  nuevo de la versión publicada en ese momento.
- Estos tests son también la red para los saltos de versión mayor de sqlite3
  (6) y sharp (0.35) del plan de dependencias.

## 6. Seguridad

Con esto la aplicación analiza XML dejados en una carpeta compartida, en la
que puede escribir más de un equipo.

- fast-xml-parser ya está en la 4.5.7, que corrige los avisos críticos de
  entidades en el DOCTYPE (commit `c592f0a`).
- **Rechazar los XML con `<!DOCTYPE`** antes de analizarlos, con su test (un
  XML con expansión de entidades). ✅ Comprobado el 2026-10-31: el XML que
  exporta la gestión del centro no lleva DOCTYPE, así que rechazarlo no
  afecta a ningún archivo legítimo.
- Un límite de tamaño razonable, muy por encima de lo que pesa un XML real
  del centro.

## 7. Fases

Cada fase actualiza el manual (`src/help/`) en el mismo commit.

0. **Garantías** (sección 5): el inventario y la redirección ya están
   resueltos; quedan los tests de compatibilidad. Va antes que todo lo demás.
1. **Publicar**: al actualizar y al crear, con hash y `sharedXml`. Sin aviso
   todavía; lo único visible es la línea de **Información del proyecto**.
2. **Avisar** en los demás equipos (3.3 y 3.4).
3. **Aplicar desde el aviso**, reutilizando `update-xml` y
   `confirm-update-xml` con la ruta del archivo publicado.
4. **Rechazo de DOCTYPE y límite de tamaño** (sección 6). Puede ir con la
   fase 1.

Encaje con el plan de dependencias en curso: la fase 0 va después del test de
dependencias (paso 2) y antes de los saltos de versión mayor, porque los tests
de compatibilidad los protegen.

## 8. Pendiente de decidir

- Si el nombre `Centro/` vale o se prefiere otro.
- Si hace falta una purga manual de los XML antiguos, como la de
  `Reemplazadas`. Con un XML por actualización, crecerá muy despacio.
