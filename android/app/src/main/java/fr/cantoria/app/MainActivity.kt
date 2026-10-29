// MainActivity — coquille WebView Cantoria (issue #54).
// Décisions PR #33 : option B « WebView native », aucun geste tactile, aucune permission.
// Sécurité conforme à docs/android-chromeos.md §4.5 : pas d'accès fichiers universel,
// pas de contenu externe, CSP du HTML conservée, JavaScript limité à notre page.
package fr.cantoria.app

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    companion object {
        // Debugging WebView : chrome://inspect (desktop Chrome / Edge) — mode debug uniquement.
        // En release, jamais activé : aucun canal de debug exposé.
        const val ASSET_URL = "file:///android_asset/cantoria.html"
    }

    private lateinit var webView: WebView
    private lateinit var bridge: CantoriaBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Inspection chrome://inspect uniquement en build debug (jamais en release).
        if (BuildConfig.DEBUG) {
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            view.settings.allowUniversalAccessFromFileURLs = false
            view.settings.allowFileAccessFromFileURLs = false
        }
        view.settings.databaseEnabled = false
        view.settings.geolocationEnabled = false
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
            override fun onPageStarted(url: String?, favicon: android.graphics.Bitmap?) {
                view.evaluateJavascript(
                    "(function(){var s=document.createElement('script');" +
                        "s.src='file:///android_asset/android-shim.js';" +
                        "document.head.appendChild(s);})();", null)
                super.onPageStarted(url, favicon)
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
        bridge = CantoriaBridge(this)
        // Pont JS équivalent window.carnetDesktop (voir preload.js côté desktop).
        // addJavascriptInterface est sûr ici : l'interface n'est exposée qu'à notre page
        // (pas de navigation externe), et chaque méthode valide ses entrées.
        view.addJavascriptInterface(bridge, "cantoriaAndroid")
    }

    // Rotation sans rechargement : la WebView (et l'état du lecteur) survit au changement
    // d'orientation — configChanges géré dans le manifest, état sauvegardé ici en dernier recours.
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

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
