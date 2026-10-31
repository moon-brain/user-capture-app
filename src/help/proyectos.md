# Proyectos

Un proyecto reúne el listado de personas de un centro, sacado de un archivo XML, las fotos que se hacen y los enlaces entre unas y otras. Cada proyecto vive en su propia carpeta y su nombre es el de esa carpeta.

## Crear un proyecto

1. Abre **Archivo > Nuevo Proyecto...** (`Ctrl+N`).
2. En **Carpeta del Proyecto**, pulsa **Seleccionar** y elige la carpeta donde se guardará el proyecto.
3. En **Archivo XML**, pulsa **Seleccionar** y elige el archivo XML con los datos del centro.
4. Pulsa **Crear**.

La aplicación crea dentro de la carpeta las subcarpetas `ingest`, `imports` y `data`, importa el XML y deja el proyecto abierto. El nombre del proyecto aparece en la barra de título y en la barra de estado.

Si tenías otro proyecto abierto, se cierra antes de crear el nuevo. Si el XML no se puede leer, no se crea nada y el proyecto abierto sigue como estaba.

Si la carpeta ya contiene un proyecto, la aplicación no crea otro encima: te avisa para que lo abras con **Archivo > Abrir Proyecto...**

> **Consejo:** Usa una carpeta nueva y vacía para cada proyecto.

## Qué debe contener el archivo XML

El XML reúne los datos del centro en cuatro bloques, que la aplicación busca por su nombre exacto:

| Bloque | Qué datos se leen |
|---|---|
| `grupos` | Código y nombre de cada grupo. |
| `alumnos` | Nombre, primer y segundo apellido, fecha de nacimiento, documento, NIA y grupo de cada alumno. |
| `docentes` | Nombre, primer y segundo apellido, fecha de nacimiento y documento. |
| `no_docentes` | Nombre, primer y segundo apellido, fecha de nacimiento y documento. |

Al importar se aplican estas reglas:

- **El alumnado se identifica por su NIA** y el personal por su **documento**. Quien no lo tenga no se importa.
- Los docentes van al grupo **Docentes** y los no docentes al grupo **No Docentes**.
- El alumnado sin grupo va al grupo **⚠ Sin grupo**.
- Si un mismo NIA o documento aparece varias veces, la persona se importa una sola vez, dando prioridad a la aparición que tiene grupo.
- Si el archivo está dañado, incompleto o no contiene ningún usuario (aunque tenga grupos), la aplicación lo rechaza con un mensaje de error y no importa nada. Al actualizar el XML, así se evita que un archivo equivocado deje el proyecto vacío.
- Por seguridad, también rechaza un archivo de más de 20 MB o que lleve una declaración `<!DOCTYPE`. El XML que exporta el programa de gestión del centro no lleva esa declaración y pesa mucho menos, así que esto solo afecta a archivos que no son el del centro.
- Del propio centro se guarda el **curso**, que el XML indica con el año en que empieza. Sirve para distinguir las solicitudes de carnet y de publicación del curso anterior (ver [Carnets y publicación oficial](carnets.md#solicitudes-de-otros-proyectos-y-del-curso-anterior)).

## El informe de importación

Si al crear el proyecto hay personas sin identificador, alumnado sin grupo o identificadores repetidos, aparece el aviso **Proyecto creado con advertencias** con el recuento de cada caso.

El detalle queda en el archivo `import-report.log` de la carpeta del proyecto: para cada persona afectada indica su nombre, tipo, grupo, documento y el motivo. Revísalo para corregir los datos en el programa de origen antes de la siguiente actualización del XML.

## Abrir un proyecto

1. Abre **Archivo > Abrir Proyecto...** (`Ctrl+O`).
2. Elige la carpeta del proyecto, la que contiene las subcarpetas `data` e `imports`.

Si la carpeta no es la de un proyecto, aparece el mensaje «No se encontró la base de datos del proyecto». Al abrir un proyecto se cierra el que estuviera abierto.

Al arrancar, la aplicación abre automáticamente el último proyecto que usaste.

## Proyectos recientes

**Archivo > Proyectos Recientes** muestra los cinco últimos proyectos abiertos, por el nombre de su carpeta. También puedes abrirlos con `Ctrl+1` a `Ctrl+5`, en el orden de la lista.

Los proyectos cuya carpeta ya no existe desaparecen de la lista al arrancar la aplicación.

## Cerrar un proyecto

Usa **Archivo > Cerrar Proyecto** (`Ctrl+W`). El proyecto se cierra sin salir de la aplicación: la lista de usuarios y el visor se vacían, la barra de estado se oculta y aparece el mensaje «Abre o crea un nuevo proyecto».

> **Importante:** Con el proyecto cerrado nadie vigila su carpeta de entrada. Las fotos que lleguen mientras tanto no se importarán después al abrirlo. Consulta [La carpeta de entrada](captura.md#la-carpeta-de-entrada).

## Consultar la información del proyecto

**Proyecto > Información del proyecto** muestra dónde están las carpetas del proyecto y qué contiene. Pasa el ratón por encima de una ruta para verla completa.

En el apartado **Ubicaciones**:

| Fila | Qué indica |
|---|---|
| Carpeta del proyecto | La carpeta que elegiste al crearlo. |
| Archivo XML | El último XML usado, al crear el proyecto o al actualizarlo. En proyectos antiguos puede aparecer «No configurado». |
| XML compartido en el depósito | El archivo con el que ese XML está publicado en el depósito para los demás equipos, con la fecha y el equipo que lo publicó. «Sin publicar» si todavía no lo está, y «No configurado» en los proyectos creados antes de la versión 1.25 hasta la siguiente actualización del XML. Si hay uno más reciente publicado por otro equipo, lo indica en una nota. Ver [El XML compartido con los demás equipos](#el-xml-compartido-con-los-demas-equipos). |
| Carpeta de entrada (ingest) | La carpeta de la que se recogen las fotos nuevas. Lleva la nota «Personalizada» si la has redirigido, y «No disponible: mientras tanto se usa la carpeta por defecto» si no se encuentra. |
| Imágenes capturadas (imports) | La carpeta donde se guardan todas las fotos del proyecto. |
| Base de datos | El archivo con los usuarios, grupos y enlaces. |
| Depósito de imágenes | La carpeta del depósito configurada, o «No configurado». |
| Copia local del depósito | La copia del depósito que la aplicación mantiene en este equipo para mostrar sus fotos con rapidez. Aparece «No configurado» mientras la aplicación no la está usando. |

En el apartado **Contenido**:

| Fila | Qué indica |
|---|---|
| Usuarios | Total de personas del proyecto, seguido del desglose en Alumnado, Docentes y No docentes. |
| Grupos | Número de grupos, incluidos los que crea la propia aplicación, como Docentes o Sin grupo. |
| Fotos enlazadas | Usuarios que tienen una foto capturada enlazada. |
| Usuarios sin foto | Usuarios sin foto capturada enlazada. Las fotos del depósito no cuentan aquí. |
| Imágenes en la carpeta imports | Todas las fotos del proyecto, estén enlazadas o no. |
| Imágenes con etiquetas | Fotos que tienen al menos una etiqueta. |

## Actualizar el archivo XML

Cuando recibas un XML más reciente (altas, bajas o cambios de grupo durante el curso), actualiza el proyecto sin perder las fotos ya enlazadas:

1. Abre **Proyecto > Actualizar archivo XML**.
2. Elige el nuevo archivo XML.
3. La aplicación compara el XML con el proyecto y muestra los cambios detectados:
   - **Usuarios nuevos**: personas que no estaban en el proyecto.
   - **Usuarios actualizados**: personas que siguen en el XML. Se cuentan todas, aunque sus datos no hayan cambiado.
   - **Usuarios eliminados**: personas del proyecto que ya no están en el XML, indicando cuántas tienen imagen y cuántas no.

   Si el XML es de un curso distinto del proyecto, el mensaje empieza con un aviso. Para empezar un curso nuevo lo habitual es crear un proyecto nuevo con su XML: al actualizar, quien no esté en el XML nuevo pasa a Eliminados o se borra.
4. Pulsa **Sí** para aplicar los cambios, o **No** para dejar el proyecto como estaba.
5. Al terminar verás el resumen: usuarios añadidos, actualizados, movidos a Eliminados y eliminados permanentemente.

Las personas se reconocen por su NIA (alumnado) o su documento (personal). De las que siguen en el XML se actualizan el nombre, los apellidos, la fecha de nacimiento, el documento y el grupo. Sus fotos enlazadas se mantienen.

Tras la actualización, el archivo `import-report.log` se reescribe con la lista actual del alumnado sin grupo, y la fila **Archivo XML** de la información del proyecto pasa a mostrar el nuevo archivo. Si la actualización falla o respondes **No**, esa fila sigue mostrando el XML anterior.

Si el proyecto tiene depósito, al terminar la actualización el XML se publica en él para los demás equipos (ver la sección siguiente). El mensaje final lo indica, y también si no se ha podido publicar y por qué. La actualización se aplica igual aunque no se publique.

> **Importante:** Revisa el número de usuarios eliminados antes de aceptar. Un XML correcto pero parcial, por ejemplo con un solo grupo, haría que el resto del centro pareciera dado de baja.

> **Consejo:** Las versiones anteriores a la 1.10.0 perdían los ceros a la izquierda de los NIA y documentos formados solo por números: `0123456` se guardaba como `123456`, y las fotos del depósito con el identificador completo no se encontraban. Si tu proyecto es anterior, actualiza el XML una vez: la aplicación reconoce a esas personas y guarda su identificador con los ceros, sin perder sus fotos.

## El XML compartido con los demás equipos

Cada equipo trabaja con su propio proyecto. Para que todos puedan tener el mismo listado del centro, la aplicación deja una copia del XML en la carpeta `Centro` del depósito:

- **Cuándo**: al actualizar el XML y al configurar el depósito. Un proyecto recién creado todavía no tiene depósito, así que su XML se publica cuando se le configura uno.
- **Cómo se llama**: `centro_AAAAMMDDHHMMSS_EQUIPO.xml`, con la fecha y hora de publicación y el nombre del equipo que lo publicó.
- **Una sola vez**: si ese mismo XML ya está en `Centro`, lo haya publicado quien lo haya publicado, no se añade otra copia.
- **Solo el XML aplicado**: si el archivo ha cambiado desde que se aplicó, o ya no está, no se publica.
- **Nada se borra**: los XML anteriores se quedan en `Centro` como historial.

### Cuando otro equipo publica un XML más reciente

Al abrir el proyecto, y cada vez que vuelves a la ventana de la aplicación, se mira si en `Centro` hay un XML más reciente que el de tu proyecto. Si lo hay, aparece sobre la lista de usuarios el aviso **XML del centro más reciente**. Pasa el ratón por encima para ver qué equipo lo publicó y cuándo.

- Pulsa el aviso para ver los cambios que aplicaría. Es el mismo análisis de **Proyecto > Actualizar archivo XML**, con una primera línea que dice de dónde viene el XML. No se aplica nada hasta que respondas que sí.
- Si respondes que no, el aviso sigue ahí y puedes volver a él cuando te venga bien, por ejemplo al acabar una sesión de fotos.
- Solo se avisa de XML del mismo curso que el proyecto. Si abres a propósito un proyecto de un curso anterior, no se te ofrece el XML del curso nuevo.
- Sin depósito configurado, o si no está disponible, no aparece ningún aviso.

> **Importante:** las versiones anteriores a la 1.25 no publican. Mientras algún equipo siga con una de ellas, puede haber actualizaciones del XML que no estén en `Centro`.

## El grupo Eliminados

Cuando una persona desaparece del XML:

- **Si tiene una foto capturada enlazada**, pasa al grupo **⚠ Eliminados** y conserva su foto, para que puedas consultarla o exportarla.
- **Si no tiene foto**, se borra del proyecto.

Si más adelante vuelve a aparecer en un XML, sale de Eliminados, vuelve a su grupo y mantiene su foto. Mientras no aparezca, se contará entre los usuarios eliminados en cada actualización, pero seguirá en Eliminados con su foto.

## Restaurar los enlaces de imágenes

Los enlaces son la relación entre cada usuario y su foto capturada. La aplicación guarda una copia de seguridad de todos los enlaces del proyecto en un único momento: cuando, después de **Archivo > Exportar > Imágenes capturadas al depósito**, aceptas desvincular las fotos de los usuarios exportados. Consulta [Exportaciones](exportaciones.md).

Si necesitas deshacer esa desvinculación:

1. Abre **Proyecto > Restaurar enlaces de imágenes...**
2. Elige una copia de la lista. Cada una muestra su fecha y hora y cuántos enlaces contiene.
3. Pulsa **Restaurar** y confirma.

Al restaurar, **todos los enlaces actuales del proyecto se sustituyen por los de la copia**: cada usuario vuelve a tener la foto que tenía en ese momento, y los que entonces no tenían foto se quedan sin ella. No se borra ni se mueve ningún archivo, y la copia sigue disponible por si quieres volver a usarla.

Si todavía no se ha hecho ninguna copia, la ventana muestra «No hay copias de seguridad disponibles.».

> **Importante:** Los enlaces que hayas hecho después de la copia se pierden al restaurarla. Si ya has enlazado fotos nuevas, tendrás que volver a enlazarlas.
