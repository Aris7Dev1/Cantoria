// MainActivity — coquille WebView Cantoria (issue #54).
// Décisions PR #33 : option B « WebView native », aucun geste tactile, aucune permission.
// Sécurité conforme à docs/android-chromeos.md §4.5 : pas d'accès fichiers universel,
// pas de contenu externe, CSP du HTML conservée, JavaScript limité à notre page.
package fr.cantoria.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    companion object {
        const val ASSET_URL = "file:///android_asset/cantoria.html"
        const val SHIM_URL = "file:///android_asset/android-shim.js"
        const val GITHUB_OWNER = "Aris7Dev1"
        const val GITHUB_REPO = "Cantoria"
    }

    private lateinit var webView: WebView
    private lateinit var bridge: CantoriaBridge
    private var updateChecker: UpdateChecker? = null

    // Échappement d'une valeur pour une chaîne littérale JavaScript :
    // backslash, apostrophe, guillemets et sauts de ligne neutralisés, afin
    // qu'aucune valeur venant de GitHub Releases ne puisse sortir de la chaîne.
    private fun jsString(value: String): String =
        value.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\r", "\\r")
            .replace("\n", "\\n")

    private fun dispatchUpdateEvent(version: String, apkUrl: String) {
        runOnUiThread {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('android-update-available'," +
                    "{detail:{version:'${jsString(version)}',apkUrl:'${jsString(apkUrl)}'}}));", null)
        }
    }

    // Contenu du shim lu une fois dans les assets : injecté par
    // evaluateJavascript à chaque chargement de page. L'injection directe
    // du CONTENU (et non d'un <script src>) n'est pas soumise à la CSP de la
    // page (script-src 'unsafe-inline' interdit les src externes) — c'est
    // l'app qui injecte son propre adaptateur, aucune ressource distante.
    private var shimContent: String? = null

    private fun loadShimContent(): String {
        shimContent?.let { return it }
        val content = assets.open("android-shim.js").use { it.readBytes().toString(Charsets.UTF_8) }
        shimContent = content
        return content
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Inspection chrome://inspect : uniquement si l'app est debuggable
        // (flag du manifest, lu ici — aucune dépendance à BuildConfig généré).
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (isDebuggable) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this)
        setContentView(webView)

        configureWebView(webView)
        installBridge(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(ASSET_URL)
        }

        checkForUpdates()
    }

    /* Vérification de version via GitHub Releases (issue #57) : au démarrage
       uniquement, depuis le processus natif (la WebView reste à zéro réseau).
       Une version plus récente est proposée à l'interface par injection
       d'événement — jamais de téléchargement forcé, l'installation reste
       un geste utilisateur. */
    private fun checkForUpdates() {
        if (updateChecker == null) updateChecker = UpdateChecker(GITHUB_OWNER, GITHUB_REPO)
        // Le pont relaie les demandes manuelles de l'interface vers le checker.
        if (this::bridge.isInitialized) {
            bridge.onUpdateAvailable = { version, apkUrl ->
                dispatchUpdateEvent(version, apkUrl)
            }
        }
        val currentVersion = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: return
        } catch (e: Exception) { return }
        updateChecker?.check(currentVersion, object : UpdateChecker.Listener {
            override fun onUpdateAvailable(version: String, apkUrl: String) {
                dispatchUpdateEvent(version, apkUrl)
            }
            override fun onUpToDate() { /* silencieux */ }
            override fun onError() { /* hors ligne : silencieux (VISION) */ }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(view: WebView) {
        // JavaScript requis par l'interface (un seul fichier autonome, aucun appel réseau).
        view.settings.javaScriptEnabled = true

        // localStorage : sans cet interrupteur, l'objet est NULL dans la WebView
        // (DOM storage désactivé par défaut sur Android). Toute la persistance
        // de l'app s'appuie dessus (carnet + cache de l'adaptateur fichier #56),
        // avec des gardes try/catch — mais l'objet doit exister. Stockage privé
        // de l'app uniquement, aucune permission requise.
        view.settings.domStorageEnabled = true

        // §4.5 : surface minimale. Pas d'accès fichiers générique, pas de contenu externe.
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.settings.allowUniversalAccessFromFileURLs = false
        view.settings.allowFileAccessFromFileURLs = false
        view.settings.databaseEnabled = false
        view.settings.mediaPlaybackRequiresUserGesture = true
        view.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        view.settings.cacheMode = WebSettings.LOAD_NO_CACHE

        // Le zoom natif pincer est géré par l'interface (taille des paroles) ; le viewport
        // du HTML est fixed. On désactive le zoom navigateur pour éviter le double zoom.
        view.settings.builtInZoomControls = false
        view.settings.displayZoomControls = false
        view.settings.setSupportZoom(false)

        // Tout reste dans la WebView : aucune navigation externe, aucune nouvelle fenêtre.
        // Le shim (adaptateur cantoriaAndroid -> carnetDesktop) est injecté au début de
        // chaque chargement de page : cantoria.html reste SANS MODIFICATION.
        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(page: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                // Injection du CONTENU du shim (pas d'un src file://) : la CSP
                // de cantoria.html (script-src 'unsafe-inline') bloquerait toute
                // balise script externe ; evaluateJavascript n'est pas soumis
                // à la CSP. L'adaptateur carnetDesktop est en place avant que
                // le script de la page ne s'exécute.
                page.evaluateJavascript(loadShimContent(), null)
                super.onPageStarted(page, url, favicon)
            }
        }
        view.webChromeClient = WebChromeClient()

        // Fond de démarrage assorti au thème sombre de l'app (#17120f, campfire).
        view.setBackgroundColor(0xFF17120F.toInt())
        // Pas de layout « edge-to-edge » : l'app s'affiche dans la zone sûre,
        // sous la barre de statut — aucun contenu caché par le bandeau natif.
        // (L'usage plein écran immersif sera une décision UI dédiée.)
    }

    private fun installBridge(view: WebView) {
        // Pont JS équivalent window.carnetDesktop (voir preload.js côté desktop).
        // addJavascriptInterface est sûr ici : l'interface n'est exposée qu'à notre page
        // (pas de navigation externe), et chaque méthode valide ses entrées.
        bridge = CantoriaBridge(this)
        view.addJavascriptInterface(bridge, "cantoriaAndroid")
    }

    // Rotation sans rechargement : la WebView (et l'état du lecteur) survit au changement
    // d'orientation — configChanges géré dans le manifest, état sauvegardé ici en dernier recours.
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (this::bridge.isInitialized && bridge.onActivityResult(requestCode, resultCode, data)) return
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
