# ✅ GUÍA PASO A PASO - APLICAR PERMISOS AWS IAM

## 🚨 DEBES HACER ESTO MANUALMENTE EN TU CUENTA AWS

### Paso 1: Entrar a AWS IAM Console

1. Ve a: https://console.aws.amazon.com/iam/
2. Inicia sesión con tu cuenta de AWS
3. En el menú izquierdo, haz clic en **"Users"** (Usuarios)

### Paso 2: Crear un usuario IAM (o buscar uno existente)

1. Haz clic en **"Create user"** (o selecciona un usuario existente)
2. Nombre sugerido: `chatbot-service-user`
3. Tipo de acceso: **Programmatic access** (Access Key)

### Paso 3: Añadir la política de permisos

1. Una vez identificado el usuario, haz clic en su nombre
2. Haz clic en la pestaña **"Permissions"** (Permisos)
3. Haz clic en el botón **"Add permissions"** → **"Create inline policy"**
4. En el editor de políticas:
   - Si te muestra un editor visual, haz clic en la pestaña **"JSON"**
   - **BORRA** todo el contenido que haya en el editor
   - **COPIA Y PEGA** el contenido del archivo `aws-iam-policy.json` incluido en este proyecto
   - **REEMPLAZA** los placeholders:
     - `YOUR_REGION` → tu región AWS (e.g., `us-east-1`)
     - `YOUR_ACCOUNT_ID` → tu ID de cuenta AWS (12 dígitos)
     - `YOUR_CONVERSATIONS_TABLE` → nombre de tu tabla de conversaciones
     - `YOUR_MESSAGES_TABLE` → nombre de tu tabla de mensajes
     - `YOUR_HOLIDAYS_TABLE` → nombre de tu tabla de festivos
     - `YOUR_S3_BUCKET` → nombre de tu bucket S3

5. Haz clic en **"Next"** (Siguiente)
6. Dale un nombre a la política: **ChatbotDynamoDBAndS3Access**
7. Haz clic en **"Create policy"** (Crear política)

### Paso 4: Generar Access Keys

1. Ve a la pestaña **"Security credentials"** del usuario
2. Haz clic en **"Create access key"**
3. Copia el **Access Key ID** y el **Secret Access Key**
4. Pega estos valores en tu archivo `.env`:
   ```
   AWS_ACCESS_KEY_ID=tu-access-key-id
   AWS_SECRET_ACCESS_KEY=tu-secret-access-key
   ```

### Paso 5: Verificar que se aplicó correctamente

1. Deberías ver la nueva política en la lista de permisos del usuario
2. El nombre debe ser **ChatbotDynamoDBAndS3Access**
3. Debe aparecer como tipo **"Inline policy"**

---

## 🔍 SOLUCIÓN DE PROBLEMAS

### Si ves error "Access Denied" después de aplicar la política:

1. Espera 1-2 minutos (AWS puede tardar en propagar los permisos)
2. Verifica que copiaste TODO el JSON correctamente
3. Verifica que reemplazaste TODOS los placeholders con tus valores reales

### Si no encuentras el usuario:

- Verifica en qué cuenta de AWS estás logueado
- Si usas múltiples cuentas, asegúrate de estar en la correcta

### Si no tienes acceso a AWS Console:

- Necesitas pedir a alguien con permisos de administrador que aplique esta política
- Envíales este archivo con las instrucciones
