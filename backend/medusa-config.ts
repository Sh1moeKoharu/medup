import { defineConfig, loadEnv } from '@medusajs/framework/utils'
import * as nodePath from 'path'
import { HIDDEN_MENU_ROUTES } from './src/lib/menu-policy'
import { CSS_TEMA_ADMIN } from "./src/lib/tema-admin"
import { DOMINIO_INTERNO } from "./src/lib/usuarios"

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const isProduction = process.env.NODE_ENV === 'production'
const redisUrl = process.env.REDIS_URL

/**
 * ── SECRETOS ────────────────────────────────────────────────────────────────
 * Antes caían a la cadena "supersecret". Un JWT_SECRET conocido permite forjar
 * sesiones de cualquier usuario, incluido el administrador. En producción se
 * falla al arrancar en lugar de arrancar inseguro.
 */
const jwtSecret = process.env.JWT_SECRET
const cookieSecret = process.env.COOKIE_SECRET

if (isProduction) {
  const missing: string[] = []
  if (!jwtSecret || jwtSecret === 'supersecret') missing.push('JWT_SECRET')
  if (!cookieSecret || cookieSecret === 'supersecret') missing.push('COOKIE_SECRET')

  if (missing.length) {
    throw new Error(
      `[CONFIG] ${missing.join(' y ')} deben definirse con un valor propio en producción. ` +
        `Genera cada uno con: openssl rand -base64 48`
    )
  }

  if (!redisUrl) {
    throw new Error(
      '[CONFIG] REDIS_URL es obligatorio en producción. Sin él, Medusa usa un ' +
        'bus de eventos en memoria y un candado local: los jobs programados y ' +
        'los workflows no sobreviven a un reinicio ni funcionan con más de una ' +
        'instancia. Instala Redis y define REDIS_URL.'
    )
  }
}

/**
 * ── COOKIES DE SESIÓN SOBRE HTTP ────────────────────────────────────────────
 *
 * Con NODE_ENV=production (o staging) Medusa marca la cookie de sesión como
 * `secure: true` y `sameSite: "none"` — ver express-loader.js del framework.
 * El navegador RECHAZA guardar cookies `Secure` servidas por HTTP, así que el
 * admin acepta el login y acto seguido rebota a la pantalla de inicio, sin
 * mostrar ningún error.
 *
 * ALLOW_INSECURE_COOKIES=1 desactiva ese marcado. Existe para servidores de
 * ENSAYO que corren en modo producción sin certificado todavía.
 *
 * ⚠️ NUNCA activarla en un servidor con datos reales: la cookie de sesión
 * viajaría en claro y cualquiera en la red podría secuestrar la sesión de un
 * administrador. La solución correcta es poner TLS delante, no esta bandera.
 */
const allowInsecureCookies = process.env.ALLOW_INSECURE_COOKIES === '1'

if (allowInsecureCookies) {
  console.warn(
    '⚠️  [CONFIG] ALLOW_INSECURE_COOKIES=1 — la cookie de sesión NO se marcará ' +
      'como Secure. Válido sólo para ensayo sin TLS. No usar con datos reales.'
  )
}

/**
 * ── INFRAESTRUCTURA ─────────────────────────────────────────────────────────
 * Estos módulos NO estaban declarados. `.env.template` traía REDIS_URL pero
 * nadie la leía, así que en cada arranque Medusa avisaba:
 *
 *   "redisUrl not found. A fake redis instance will be used."
 *   "Local Event Bus installed. This is not recommended for production."
 *
 * Se declaran de forma condicional para que el entorno local siga funcionando
 * sin Redis (cae a los módulos en memoria por omisión), mientras que producción
 * lo exige de forma explícita arriba. Nada de degradación silenciosa.
 */
const infrastructureModules = redisUrl
  ? [
      {
        resolve: '@medusajs/medusa/event-bus-redis',
        options: { redisUrl },
      },
      {
        resolve: '@medusajs/medusa/cache-redis',
        options: { redisUrl },
      },
      {
        resolve: '@medusajs/medusa/workflow-engine-redis',
        // OJO: este módulo NO acepta `redisUrl` plano como los otros tres.
        // Su loader hace `const { ... } = options?.redis`, así que la URL va
        // anidada. Con la forma plana revienta al arrancar con
        // "Cannot destructure property 'url' of '(intermediate value)'".
        options: { redis: { redisUrl } },
      },
      {
        resolve: '@medusajs/medusa/locking',
        options: {
          providers: [
            {
              resolve: '@medusajs/medusa/locking-redis',
              id: 'locking-redis',
              is_default: true,
              options: { redisUrl },
            },
          ],
        },
      },
    ]
  : []

/**
 * ── ARCHIVOS SUBIDOS ────────────────────────────────────────────────────────
 * Sin declarar el módulo, el proveedor local escribe en `<cwd>/static`, es
 * decir dentro de `.medusa/server`, que `medusa build` borra en cada
 * compilación — y ahí viven las imágenes de producto que la base referencia
 * por URL.
 *
 * Con ALTUS_DATA_DIR definida se apunta fuera del árbol de build. Sin ella se
 * conserva exactamente el valor por omisión anterior.
 *
 * ⚠️ No basta con esto: Medusa sirve /static desde una ruta CODIFICADA en el
 * framework. Ver deploy/link-persistent-dirs.sh.
 */
const dataDir = process.env.ALTUS_DATA_DIR?.trim()
const uploadDir = dataDir
  ? nodePath.join(nodePath.resolve(dataDir), 'static')
  : nodePath.join(process.cwd(), 'static')

const backendUrl = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000'

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    /**
     * shared  = una sola instancia atiende API y ejecuta los jobs programados.
     * server  = sólo API.  worker = sólo jobs y workflows.
     *
     * ⚠️ Si algún día se separa en server + worker, DEBE existir una instancia
     * en modo `worker`: los jobs `check-expirations` y `block-expired-batches`
     * sólo corren ahí. Una instalación con puro `server` deja de bloquear lotes
     * caducados sin emitir ningún error.
     */
    workerMode:
      (process.env.MEDUSA_WORKER_MODE as 'shared' | 'server' | 'worker') ??
      'shared',
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: jwtSecret || 'supersecret',
      cookieSecret: cookieSecret || 'supersecret',
    },
    // Se aplica encima de los valores que calcula el framework.
    ...(allowInsecureCookies
      ? { cookieOptions: { secure: false, sameSite: 'lax' as const } }
      : {}),
  },
  admin: {
    disable: false,
    /**
     * Idioma inicial del panel de administración.
     *
     * EL PROBLEMA: el admin detecta el idioma con react-i18next en el orden
     * `cookie -> localStorage -> header`, con respaldo en inglés. Es decir que
     * depende de la configuración del navegador de cada usuario. Para un
     * cliente nacional eso significa que unos ven el menú en español y otros en
     * inglés, sin razón aparente.
     *
     * `AdminOptions` no expone ninguna opción de idioma (sólo disable, path,
     * backendUrl, storefrontUrl y este hook `vite`), y tampoco sirve un
     * middleware: el admin se monta en `promiseAll` ANTES que los middlewares
     * del proyecto, así que una ruta nuestra sobre /app nunca se ejecutaría.
     *
     * SOLUCIÓN: se inyecta un script en el index.html del admin durante el
     * build. Corre antes que la aplicación y siembra la preferencia de idioma
     * que i18next leerá después.
     *
     * Respeta al usuario: sólo escribe si NO hay preferencia previa, así que
     * quien cambie el idioma desde Ajustes conserva su elección.
     */
    vite: (config: any) => {
      const lang = process.env.ADMIN_DEFAULT_LANGUAGE || 'es'
      // Dirección del POS para el atajo del menú. Con la config de Nginx
      // del repo, el POS vive en la raíz del mismo origen.
      const posUrl = process.env.ADMIN_POS_URL || '/'

      config.plugins = config.plugins || []
      config.plugins.push({
        name: 'altus-default-admin-language',
        transformIndexHtml(html: string) {
          // Vite invoca este hook más de una vez, así que se marca el script
          // para no duplicarlo en el HTML final.
          const marker = 'data-altus-lang'
          if (html.includes(marker)) {
            return html
          }

          const langScript = `<script ${marker}>(function(){try{` +
            `var hasCookie=document.cookie.indexOf('lng=')!==-1;` +
            `var hasStorage=window.localStorage&&window.localStorage.getItem('lng');` +
            `if(!hasCookie&&!hasStorage){` +
            `document.cookie='lng=${lang};path=/;max-age=31536000';` +
            `if(window.localStorage){window.localStorage.setItem('lng','${lang}');}` +
            `}}catch(e){}})();</script>`

          /**
           * Oculta del menú lo que cada rol no puede usar.
           *
           * La política se serializa desde src/lib/menu-policy.ts, así que sigue
           * habiendo un solo archivo TypeScript como fuente de verdad.
           *
           * Se inyecta aquí y no en un widget porque los widgets sólo se montan
           * en zonas concretas — listas de productos, pedidos y clientes —, que
           * son justamente las pantallas ocultas para el área médica: el widget
           * nunca llegaría a ejecutarse para un médico.
           *
           * ⚠️ Es usabilidad, no seguridad: se esquiva con F12. El control real
           * son los guards de src/api/middlewares.ts.
           */
          const policy = JSON.stringify(HIDDEN_MENU_ROUTES)
          const menuScript = `<script data-altus-menu>(function(){try{` +
            `var P=${policy};` +
            `fetch('/admin/users/me',{credentials:'include'})` +
            `.then(function(r){return r.ok?r.json():null})` +
            `.then(function(d){` +
            `var role=d&&d.user&&d.user.metadata?d.user.metadata.role:null;` +
            `var hide=role&&P[role]?P[role]:[];` +
            `if(!hide.length)return;` +
            `var sel=hide.map(function(h){return 'a[href^="'+h+'"]'}).join(',');` +
            `var s=document.createElement('style');` +
            `s.setAttribute('data-altus-menu','');` +
            `s.innerHTML=sel+'{display:none !important}';` +
            `document.head.appendChild(s);` +
            `}).catch(function(){});` +
            `}catch(e){}})();</script>`

          const posScript = `<script data-altus-pos>window.__ALTUS_POS_URL__=${JSON.stringify(posUrl)};</script>`

          /**
           * Salir, siempre a la vista.
           *
           * El panel esconde la salida detrás del avatar de la esquina, y el
           * personal no la encuentra: en un equipo compartido eso significa
           * sesiones que se quedan abiertas.
           *
           * Se inyecta aquí y no como widget por lo mismo que el menú: los
           * widgets sólo se montan en zonas concretas —listas de productos,
           * pedidos y clientes—, así que no aparecerían en las pantallas donde
           * trabajan auditoría o dirección.
           *
           * El botón muestra también QUIÉN está dentro. En un mostrador
           * compartido, ver con qué cuenta está abierta la sesión evita
           * trabajar sin darse cuenta con el perfil de otro.
           *
           * Cierra con DELETE /auth/session, que es lo que borra la cookie de
           * sesión, y luego lleva al inicio de sesión. Pide confirmación: un
           * botón siempre visible se pulsa sin querer, y aquí perder la sesión
           * a media captura cuesta trabajo rehecho.
           */
          // El color del texto del botón sale de `--contrast-fg-primary`, que es
          // el token que Medusa usa para SU botón principal: así este va a juego
          // en los dos temas. Con `--fg-on-inverted` quedaba texto oscuro sobre
          // botón oscuro en modo oscuro.
          const salirScript = `<script data-altus-salir>(function(){try{
var CSS='#altus-salir{position:fixed;right:16px;bottom:16px;z-index:2147483000;'+
'display:flex;gap:8px;align-items:center;font:500 12px/1.2 system-ui,sans-serif}'+
'#altus-salir .p{background:var(--bg-base);border:1px solid var(--border-base);'+
'border-radius:999px;padding:7px 13px;color:var(--fg-muted);white-space:nowrap;'+
'box-shadow:0 1px 3px rgba(0,0,0,.08)}'+
'#altus-salir button{cursor:pointer;border:1px solid var(--border-base);border-radius:999px;'+
'padding:7px 15px;background:var(--button-inverted);color:var(--contrast-fg-primary);'+
'font:inherit;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.18)}'+
'#altus-salir button:hover{background:var(--button-inverted-hover)}'+
'#altus-salir button.rojo{background:var(--button-danger);'+
'border-color:var(--button-danger);color:var(--fg-on-color)}';
function montar(nombre){
  if(document.getElementById('altus-salir'))return;
  var st=document.createElement('style');st.setAttribute('data-altus-salir','');
  st.innerHTML=CSS;document.head.appendChild(st);
  var c=document.createElement('div');c.id='altus-salir';
  var quien=document.createElement('span');quien.className='p';quien.textContent=nombre;
  var b=document.createElement('button');b.textContent='Cerrar sesión';
  b.onclick=function(){
    if(b.classList.contains('rojo')){
      fetch('/auth/session',{method:'DELETE',credentials:'include'})
        .catch(function(){})
        .then(function(){window.location.href='/app/login'});
      b.textContent='Saliendo…';b.disabled=true;return;
    }
    b.classList.add('rojo');b.textContent='Confirmar salida';
    setTimeout(function(){
      if(b.classList.contains('rojo')&&!b.disabled){
        b.classList.remove('rojo');b.textContent='Cerrar sesión';
      }
    },4000);
  };
  c.appendChild(quien);c.appendChild(b);document.body.appendChild(c);
}
var intentos=0;
function probar(){
  if(document.getElementById('altus-salir'))return;
  intentos++;
  fetch('/admin/users/me',{credentials:'include'})
   .then(function(r){return r.ok?r.json():null})
   .then(function(d){
     if(d&&d.user){
       var u=d.user;
       montar([u.first_name,u.last_name].filter(Boolean).join(' ')||u.email);
       return;
     }
     // Sin sesión todavía: se entra desde la pantalla de acceso y el panel
     // navega sin recargar, asi que este script no volveria a correr nunca y
     // el boton no aparecia hasta la siguiente recarga. Se reintenta un rato.
     if(intentos<30)setTimeout(probar,2000);
   }).catch(function(){if(intentos<30)setTimeout(probar,2000)});
}
probar();
}catch(e){}})();</script>`

          /**
           * En el panel también se entra con nombre de usuario.
           *
           * ── POR QUÉ HAY QUE INYECTAR ALGO ─────────────────────────────────
           * El formulario de acceso del panel valida el formato de correo:
           *
           *     var LoginSchema = z.object({ email: z.string().email(), ... })
           *
           * y viene compilado dentro de `@medusajs/dashboard`, así que no se
           * puede editar. Escribir `caja` lo rechaza el propio formulario, en el
           * navegador, sin llegar a mandar nada.
           *
           * Como lo que guardamos ES un correo bien formado —`caja@sigh.local`,
           * ver src/lib/usuarios.ts— basta con completarlo: la persona escribe
           * `caja`, y al salir del campo se convierte en `caja@sigh.local`. La
           * validación de Medusa lo da por bueno y no hay nada que parchear.
           *
           * ── SI ESTO SE ROMPE ──────────────────────────────────────────────
           * No deja a nadie fuera. Quien no vea el completado automático puede
           * escribir `usuario@${DOMINIO_INTERNO}` entero y entra igual. Por eso
           * se eligió el sufijo en vez de pelearse con la validación: el modo de
           * fallo es una molestia, no un bloqueo.
           *
           * Se escribe con el asignador nativo del input y se lanza un evento
           * `input`, porque el campo es un componente controlado de React: dejar
           * el valor a pelo no se lo comunica a nadie.
           */
          const usuarioScript = `<script data-altus-usuario>(function(){try{
var DOM='@${DOMINIO_INTERNO}';
function completar(campo){
  var v=(campo.value||'').trim();
  if(!v||v.indexOf('@')!==-1)return;
  var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(campo,v.toLowerCase()+DOM);
  campo.dispatchEvent(new Event('input',{bubbles:true}));
}
function campoDeUsuario(){
  return document.querySelector('input[name="email"]');
}
function renombrar(){
  var c=campoDeUsuario();
  if(!c||c.dataset.altusListo)return;
  c.dataset.altusListo='1';
  c.setAttribute('autocomplete','username');
  c.setAttribute('placeholder','Usuario');
  // La etiqueta se busca POR EL IDENTIFICADOR del campo, no subiendo por el
  // árbol. Subiendo se encontraba la única etiqueta que hay en esa pantalla,
  // que es la de la contraseña, y acababa diciendo «Usuario». Hoy el campo de
  // usuario no tiene etiqueta propia y se apoya en el marcador de posición;
  // si Medusa le pone una algún día, esto la renombra sola.
  if(c.id){
    var et=document.querySelector('label[for="'+c.id+'"]');
    if(et)et.textContent='Usuario';
  }
  c.addEventListener('blur',function(){completar(c)});
}
document.addEventListener('submit',function(){
  var c=campoDeUsuario();
  if(c)completar(c);
},true);
new MutationObserver(renombrar).observe(document.documentElement,{childList:true,subtree:true});
renombrar();
}catch(e){}})();</script>`

          /**
           * La marca en la pantalla de acceso del panel.
           *
           * ── QUÉ SE VEÍA ───────────────────────────────────────────────────
           * «Bienvenido a Medusa», el logotipo de Medusa, y un botón que decía
           * «Continuar con Email» cuando ahí ya no se escribe un correo. Es la
           * primera pantalla que ve quien administra la clínica, y hablaba de
           * un producto que no es el suyo.
           *
           * De paso se corrigen dos cosas del propio panel: «Inicia sesión para
           * acceder a LA ÁREA de cuentas», que está mal en español, y «Show
           * password», que se quedó sin traducir.
           *
           * ── POR QUÉ POR EL DOM Y NO POR i18next ───────────────────────────
           * Las cadenas viven en el diccionario del panel, y sí se pueden pisar
           * con `addResourceBundle` —así se hace con Cliente/Paciente en
           * `src/admin/lib/vocabulario-clinico.ts`—. Pero eso corre cuando se
           * carga una de NUESTRAS rutas, y al acceso se llega antes de que
           * exista ninguna. Aquí no hay i18next todavía, así que se cambia el
           * texto ya pintado.
           *
           * Se compara por el texto exacto, no por posición: si Medusa cambia
           * la estructura, esto deja de aplicar en vez de romper algo. Y el
           * observador lo vuelve a poner si React repinta.
           */
          const marcaScript = `<script data-altus-marca>(function(){try{
var CAMBIOS=[
  ['Bienvenido a Medusa','Altus'],
  ['Inicia sesión para acceder a la área de cuentas','Panel de administración de la clínica'],
  ['Continuar con Email','Entrar'],
  ['Show password','Mostrar contraseña'],
  ['Hide password','Ocultar contraseña'],
  ['Volver al login','Volver al acceso']
];
function pintar(){
  if(!document.title)document.title='Altus';
  var nodos=document.querySelectorAll('h1,p,button,span');
  for(var i=0;i<nodos.length;i++){
    var n=nodos[i];
    if(n.children.length)continue;
    var t=n.textContent.trim();
    for(var j=0;j<CAMBIOS.length;j++){
      if(t===CAMBIOS[j][0]){n.textContent=CAMBIOS[j][1];break;}
    }
  }
  // El logotipo de Medusa, sólo en la pantalla de acceso. Se oculta el
  // RECUADRO entero, no el dibujo: escondiendo sólo el svg quedaba el cuadro
  // gris de 50x50 flotando sobre el título. En el resto del panel ese recuadro
  // no existe, así que no se toca nada más.
  if(location.pathname.indexOf('/login')!==-1||location.pathname.indexOf('/invite')!==-1){
    var marca=document.querySelector('svg.rounded-\\\\[10px\\\\]');
    var caja=marca&&marca.closest('div.rounded-xl');
    if(caja&&!caja.dataset.altusOculto){caja.dataset.altusOculto='1';caja.style.display='none';}
  }
}
new MutationObserver(pintar).observe(document.documentElement,{childList:true,subtree:true});
pintar();
}catch(e){}})();</script>`

          /**
           * Salir del panel cierra el punto de venta, y al revés, en el mismo
           * navegador.
           *
           * Administración entra a los dos, y cada uno guarda la sesión a su
           * manera: el panel con una cookie del servidor, el punto de venta con
           * un token en el navegador. Salir de uno no tocaba el otro.
           *
           * La señal es la cookie `altus_salida` con la hora de la salida. Es
           * una cookie y no el almacenamiento del navegador porque éste es por
           * origen —incluye el puerto—, y en desarrollo el panel (4173) y el
           * punto de venta (8081) no lo comparten; las cookies son por host y
           * las ven los dos. El punto de venta hace lo mismo desde
           * frontend/utils/sesion-compartida.ts: el nombre tiene que coincidir.
           *
           * Lo que hace este script:
           *  · Envuelve `fetch` para ver cuándo el panel cierra su sesión
           *    (`DELETE /auth/session`). Así se entera tanto del botón flotante
           *    como de «Cerrar sesión» del menú de Medusa, que no se puede tocar.
           *    La dirección puede llegar como texto, como `Request` o como `URL`
           *    —el SDK de Medusa usa esta última—, así que se miran las tres.
           *    Va el PRIMERO del `<head>` para envolver `fetch` antes de que la
           *    aplicación lo use.
           *  · Cada 2 s, y al volver a la pestaña, mira si hubo una salida
           *    POSTERIOR a la entrada al panel; si la hubo, cierra y va al acceso.
           *    Mientras se está en la pantalla de acceso la hora de entrada se
           *    renueva: una salida vieja no puede echar a quien entra después.
           */
          // Sin barras invertidas a propósito: dentro de esta plantilla una barra
          // invertida se come el carácter que la sigue, la expresión regular sale
          // rota, el script da error de sintaxis y no corre, sin avisar. Pasó.
          // Por eso se compara con indexOf y no con expresiones regulares.
          const sesionScript = `<script data-altus-sesion>(function(){try{
var CLAVE='altus_salida';
function leer(){var t=document.cookie.split('; ');for(var i=0;i<t.length;i++){if(t[i].indexOf(CLAVE+'=')===0)return Number(t[i].slice(CLAVE.length+1))||0;}return 0;}
function marcar(){var s=location.protocol==='https:'?'; Secure':'';document.cookie=CLAVE+'='+Date.now()+'; path=/; max-age=2592000; SameSite=Lax'+s;}
var original=window.fetch.bind(window);
window.fetch=function(entrada,opciones){
  var url=typeof entrada==='string'?entrada:entrada&&(entrada.url||entrada.href)?String(entrada.url||entrada.href):String(entrada||'');
  var metodo=String((opciones&&opciones.method)||(entrada&&entrada.method)||'GET').toUpperCase();
  var p=original(entrada,opciones);
  if(metodo==='DELETE'&&url.split('?')[0].slice(-13)==='/auth/session'){p.then(function(r){if(r.status<500)marcar();},function(){});}
  return p;
};
var desde=Date.now();var saliendo=false;
function enAcceso(){var r=location.pathname;return r.indexOf('/app/login')===0||r.indexOf('/app/reset-password')===0||r.indexOf('/app/invite')===0;}
function revisar(){
  if(enAcceso()){desde=Date.now();saliendo=false;return;}
  if(saliendo||leer()<=desde)return;
  saliendo=true;
  original('/auth/session',{method:'DELETE',credentials:'include'}).catch(function(){}).then(function(){location.href='/app/login';});
}
setInterval(revisar,2000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)revisar();});
window.addEventListener('focus',revisar);
}catch(e){}})();</script>`

          return html.replace(
            '</head>',
            `${sesionScript}${langScript}${posScript}${menuScript}${salirScript}${usuarioScript}${marcaScript}${CSS_TEMA_ADMIN}</head>`
          )
        },
      })

      return config
    },
  },
  modules: [
    ...infrastructureModules,
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: uploadDir,
              backend_url: `${backendUrl}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              api_key: process.env.RESEND_API_KEY,
              from: process.env.NOTIFICATION_FROM || "Agilo POS <onboarding@resend.dev>",
            },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/medical-customer",
      key: "medical_customer",
    },
    {
      resolve: "./src/modules/medical-inventory",
      key: "medical_inventory",
    },
    {
      resolve: "./src/modules/cash-session",
      key: "cash_session",
    },
    {
      resolve: "./src/modules/medical-orders",
      key: "medical_orders",
    },
    {
      resolve: "./src/modules/audit-logs",
      key: "audit_logs",
    },
    {
      resolve: "./src/modules/b2b-agreements",
      key: "b2b_agreements",
    },
    {
      resolve: "./src/modules/inventory-movements",
      key: "inventory_movements",
    },
    {
      resolve: "./src/modules/requisitions",
      key: "requisitions",
    },
    {
      resolve: "./src/modules/clinical-notes",
      key: "clinical_notes",
    },
    {
      resolve: "./src/modules/honorarios",
      key: "honorarios",
    },
    {
      resolve: "./src/modules/aseguranzas",
      key: "aseguranzas",
    },
  ]
})
