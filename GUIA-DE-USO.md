# 🎓 AWS Solutions Architect Professional - Quiz de Preparación

## ¿Qué es?

Una aplicación web para practicar y prepararse para el examen **AWS Solutions Architect Professional (SAP-C02)**. Contiene cientos de preguntas en español, organizadas por tema y con diferentes modos de estudio.

**URL:** https://quiz-pi-ashen.vercel.app

---

## 🔐 Acceso (MFA)

La app está protegida con autenticación MFA (código de 6 dígitos). Para acceder necesitás configurar la clave en tu app de autenticación.

### Configurar el Authenticator

1. Abrí tu app de autenticación (Google Authenticator, Authy, Microsoft Authenticator, etc.)
2. Seleccioná **"Agregar cuenta"** → **"Ingresar clave manualmente"**
3. Configurá así:
   - **Nombre de la cuenta:** AWS Quiz (o el que quieras)
   - **Clave secreta:** `6WITODDILRU5DOS6LNRDFHN6FEXF4X4O`
   - **Tipo:** Basado en tiempo (TOTP)
   - **Dígitos:** 6
   - **Intervalo:** 30 segundos
4. Guardar

### Ingresar al Quiz

1. Entrá a la URL del quiz
2. Escribí tu nombre (informativo, no valida)
3. Ingresá el código de 6 dígitos que muestra tu Authenticator
4. Clic en **Ingresar**

> ⚠️ El código cambia cada 30 segundos. Si te rechaza, esperá a que se genere uno nuevo.

---

## 📝 Modos de Uso

### Modo Examen
- **75 preguntas** aleatorias
- **180 minutos** (3 horas) — igual que el examen real
- No muestra la respuesta correcta hasta finalizar
- Al terminar muestra el porcentaje y si aprobaste (≥75%)

### Modo Práctica
- **20 preguntas** aleatorias
- Sin límite de tiempo
- Podés verificar cada respuesta de forma inmediata
- Ideal para aprender de los errores

### Modo Estudio
- Preguntas agrupadas por tema:
  - Complejidad Organizacional
  - Nuevas Soluciones
  - Migración y Modernización
  - Optimización de Costos
  - Mejora Continua
  - Seguridad
  - Networking
  - Almacenamiento
  - Bases de Datos
  - Contenedores y Serverless
- 20 preguntas por tema con verificación inmediata

---

## 💡 Tips

- Usá el **Modo Estudio** para reforzar áreas débiles
- Hacé al menos un **Modo Examen completo** por semana para medir progreso
- El examen real aprueba con ~75%, así que apuntá a 80%+ en práctica
- Las preguntas con múltiple respuesta lo indican en el enunciado

---

## 🛠️ Soporte

Si tenés problemas para acceder o el código MFA no funciona:
- Verificá que tu reloj esté sincronizado (el TOTP depende de la hora exacta)
- Probá regenerar el código esperando al próximo ciclo de 30 segundos
- Asegurate de haber copiado bien la clave secreta
