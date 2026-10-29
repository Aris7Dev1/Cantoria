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
    }

    private lateinit var webView: WebView
    private lateinit var bridge: CantoriaBridge

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
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(view: WebView) {
        // JavaScript requis par l'interface (un seul fichier autonome, aucun appel réseau).
        view.settings.javaScriptEnabled = true

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
                page.evaluateJavascript(
                    "(function(){var s=document.createElement('script');" +
                        "s.src='$SHIM_URL';" +
                        "document.head.appendChild(s);})();", null)
                super.onPageStarted(page, url, favicon)
            }
        }
        view.webChromeClient = WebChromeClient()

        // Fond de démarrage assorti au thème sombre de l'app (#17120f, campfire).
        view.setBackgroundColor(0xFF17120F.toInt())

        // Plein écran sous la barre système (cible : tél posé à un mètre).
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
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
