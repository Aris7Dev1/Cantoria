// UpdateChecker — vérification de version via GitHub Releases (issue #57).
// Décision PR #33 : sideload APK via GitHub Releases, pas de Play Store.
//
// Discipline VISION n°2 : le SEUL processus autorisé à toucher le réseau est
// le processus natif (équivalent du main.js desktop et d'electron-updater).
// La WebView n'effectue AUCUN appel réseau — elle est notifiée par le pont.
//
// Respect de l'utilisateur : vérification au démarrage uniquement, jamais
// de téléchargement forcé, jamais d'installation silencieuse. Le geste
// d'installation appartient à l'utilisateur (paramètre « sources inconnues »).
package fr.cantoria.app

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class UpdateChecker(
    private val repoOwner: String,
    private val repoName: String,
) {
    companion object {
        const val API_URL_TEMPLATE = "https://api.github.com/repos/%s/%s/releases/latest"
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 15_000
        const val MAX_JSON_BYTES = 1L shl 20 // 1 Mo : la réponse metadata tient largement
    }

    interface Listener {
        fun onUpdateAvailable(version: String, apkUrl: String)
        fun onUpToDate()
        fun onError()
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var inFlight = false

    fun check(currentVersion: String, listener: Listener) {
        if (inFlight) return
        inFlight = true
        thread(start = true) {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(API_URL_TEMPLATE.format(repoOwner, repoName))
                connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = READ_TIMEOUT_MS
                    // API publique : pas de jeton, identification du client uniquement.
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "Cantoria-UpdateChecker")
                    instanceFollowRedirects = true
                }
                val code = connection.responseCode
                if (code != 200) {
                    notify(listener) { it.onError() }
                    return@thread
                }
                val body = connection.inputStream.use { input ->
                    val bytes = input.readNBytesOrEmpty(MAX_JSON_BYTES)
                    String(bytes, Charsets.UTF_8)
                }
                val release = JSONObject(body)
                val latest = release.optString("tag_name", "").removePrefix("v")
                val assets = release.optJSONArray("assets") ?: run {
                    notify(listener) { it.onError() }
                    return@thread
                }
                // Chercher l'artefact APK du nommage convenu (issue #58) :
                // cantoria-<version>-android.apk
                var apkUrl = ""
                for (i in 0 until assets.length()) {
                    val asset = assets.optJSONObject(i) ?: continue
                    val name = asset.optString("name", "")
                    if (name.endsWith(".apk")) {
                        apkUrl = asset.optString("browser_download_url", "")
                        if (name.contains("android")) break
                    }
                }
                if (latest.isEmpty() || apkUrl.isEmpty()) {
                    notify(listener) { it.onError() }
                    return@thread
                }
                if (isNewer(latest, currentVersion)) {
                    notify(listener) { it.onUpdateAvailable(latest, apkUrl) }
                } else {
                    notify(listener) { it.onUpToDate() }
                }
            } catch (e: Exception) {
                // Hors ligne, DNS, timeout : silencieux (VISION : jamais bloquant).
                notify(listener) { it.onError() }
            } finally {
                connection?.disconnect()
                inFlight = false
            }
        }
    }

    private fun notify(listener: Listener, block: (Listener) -> Unit) {
        mainHandler.post { block(listener) }
    }

    /* Comparaison semver : 1.2.10 > 1.2.9 (numérique par segment, pas
       lexicographique). Testée par UpdateCheckerTest. */
    fun isNewer(candidate: String, current: String): Boolean {
        val c = candidate.split('.').map { it.toIntOrNull() ?: 0 }
        val cur = current.split('.').map { it.toIntOrNull() ?: 0 }
        val n = maxOf(c.size, cur.size)
        for (i in 0 until n) {
            val a = c.getOrElse(i) { 0 }
            val b = cur.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }
}

private fun java.io.InputStream.readNBytesOrEmpty(max: Long): ByteArray {
    val buffer = ByteArray(8 * 1024)
    val out = java.io.ByteArrayOutputStream()
    var total = 0L
    while (total < max) {
        val read = this.read(buffer)
        if (read < 0) break
        out.write(buffer, 0, read)
        total += read
    }
    return out.toByteArray()
}
