# Scorpk

**Scorpk** es una extensión de Visual Studio Code diseñada para convertirse en el centro de control definitivo de agentes de inteligencia artificial para programación.

El nombre **Scorpk** transmite potencia, velocidad y precisión. Es una herramienta hecha para desarrolladores que quieren trabajar más rápido, con más control y con la capacidad de orquestar múltiples inteligencias artificiales al mismo tiempo.

---

## Visión

Scorpk no es solo otro chat de IA dentro de VS Code.  
Es un **sistema multiagente de programación** completo, pensado para que el usuario tenga el máximo control sobre qué modelos usa, cómo los combina y cómo trabajan juntos dentro del editor.

La extensión permite dos formas principales de trabajo:

1. **Usar proveedores individuales** (OpenAI, Claude, Groq, Cerebras, NVIDIA, OpenRouter, Kimi, DeepSeek, o cualquier endpoint compatible con OpenAI).
2. **Usar OmniRoute** como puerta de entrada única, aprovechando todos los proveedores ya configurados en él con una sola URL y una sola API key.

El usuario decide si quiere trabajar con **un solo agente** o con un **equipo completo de agentes** especializados.

---

## Propuesta de valor

- Control total sobre las APIs y proveedores.
- Capacidad de usar múltiples modelos al mismo tiempo.
- Sistema multiagente real orientado a tareas de programación.
- Acceso completo al entorno de Visual Studio Code (archivos, terminal, editor, git, etc.).
- Flexibilidad para trabajar de forma simple o compleja según la necesidad del momento.
- Experiencia rápida, potente y centrada en el flujo de trabajo real del desarrollador.

---

## Funcionalidades principales

### 1. Gestión de Proveedores

El usuario puede agregar tantas APIs como desee:

- OpenAI
- Anthropic (Claude)
- Groq
- Cerebras
- NVIDIA NIM
- OpenRouter
- Kimi
- DeepSeek
- Cualquier proveedor compatible con el formato OpenAI

Cada proveedor se configura con:
- Nombre personalizado
- API Key
- Base URL (si es necesario)
- Modelo por defecto (opcional)

Además, existe un modo simplificado:

> **Usar OmniRoute**  
> Solo se necesita la URL local (`http://localhost:20128/v1`) y la API key de OmniRoute.  
> Con esto, Scorpk tiene acceso inmediato a todos los proveedores y modelos que el usuario ya tenga configurados en OmniRoute.

### 2. Modos de trabajo

#### Modo Agente Único
El usuario elige un solo proveedor/modelo y trabaja de forma directa, similar a un asistente tradicional pero con acceso total al editor.

#### Modo Multiagente
El usuario puede activar varios agentes al mismo tiempo, cada uno con un rol específico.  

Ejemplos de roles predefinidos:

- **Planner** → Analiza la tarea, define la arquitectura y divide el trabajo.
- **Coder** → Escribe e implementa el código.
- **Reviewer** → Revisa el código, encuentra errores y propone mejoras.
- **Tester** → Genera y ejecuta pruebas.
- **Documenter** → Escribe documentación y comentarios.
- **Debugger** → Analiza errores y propone soluciones.

El usuario puede:
- Activar o desactivar agentes según la tarea.
- Asignar un proveedor/modelo diferente a cada agente.
- Crear agentes personalizados con roles propios.
- Decidir si los agentes trabajan de forma secuencial o colaborativa.

Cuando hay varias APIs configuradas, Scorpk puede repartir automáticamente los agentes entre esos proveedores, o el usuario puede asignarlos manualmente.

### 3. Acceso total a Visual Studio Code

Scorpk no está limitado a solo responder texto. Tiene capacidad completa de interactuar con el entorno de desarrollo:

- Leer y escribir archivos
- Crear, modificar y eliminar carpetas
- Ejecutar comandos en la terminal
- Aplicar cambios directamente en el editor
- Trabajar con Git
- Analizar el contexto del proyecto actual
- Usar el explorador de archivos y el editor activo

Esto permite que los agentes no solo generen código, sino que realmente lo implementen dentro del proyecto.

### 4. Experiencia de usuario

La extensión se presenta como un panel lateral potente y limpio, donde el usuario puede:

- Ver el estado de todos los agentes activos
- Observar en tiempo real qué agente está trabajando y con qué modelo
- Enviar instrucciones al equipo completo o a un agente específico
- Revisar el historial de la conversación y de las acciones realizadas
- Cambiar fácilmente entre modo single y multiagente
- Gestionar proveedores y configuraciones sin salir del flujo de trabajo

---

## Casos de uso principales

- Desarrollar una nueva funcionalidad completa con un equipo de agentes (planificación → implementación → revisión → testing).
- Refactorizar código grande usando un agente especializado en análisis y otro en reescritura.
- Depurar errores complejos con un agente enfocado únicamente en encontrar la causa raíz.
- Documentar un proyecto completo de forma automática.
- Trabajar con varios modelos al mismo tiempo según el tipo de tarea (modelo fuerte para lógica compleja, modelo rápido y barato para tareas menores).
- Usar OmniRoute como backend único y aprovechar todos los proveedores free y de pago ya configurados.

---

## Filosofía de Scorpk

Scorpk está diseñado bajo estos principios:

- **Potencia**: Capacidad real de multiagente, no solo un chat bonito.
- **Velocidad**: Flujo de trabajo rápido y sin fricción.
- **Control**: El usuario decide qué modelos usa y cómo se organizan.
- **Flexibilidad**: Funciona igual de bien con una sola API o con muchas.
- **Integración profunda**: No es un chatbot externo, es parte del editor.

---

## Resumen

**Scorpk** es la extensión de Visual Studio Code que permite a los desarrolladores orquestar múltiples agentes de inteligencia artificial de forma potente, flexible y completamente integrada al editor.

Puede trabajar con cualquier proveedor compatible con OpenAI, o directamente con OmniRoute.  
Permite tanto el uso de un solo agente como de un equipo completo de agentes especializados.  
Y tiene acceso total al entorno de Visual Studio Code para no solo generar código, sino realmente construirlo.

Scorpk no asiste.  
**Scorpk ejecuta.**