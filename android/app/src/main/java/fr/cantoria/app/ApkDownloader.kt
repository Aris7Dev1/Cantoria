// ApkDownloader — téléchargement de l'APK de mise à jour (issue #57, volet
// installation). Suite de UpdateChecker : la version plus récente est trouvée
// par le checker, l'utilisateur valide dans l'interface (bandeau natif du
// cantoria.html), puis le processus natif télécharge l'APK dans le stockage
// privé avant de lancer l'installateur système (geste utilisateur final).
//
// Discipline VISION n°2 : le SEUL processus autorisé à toucher le réseau est
// le processus natif. La WebView n'effectue AUCUN appel réseau — elle est
// notifiée de la progression par injection d'événement.
package fr.cantoria.app

import android.os.Handler
import android.os.Looper
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class ApkDownloader {

    companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 30_000
        const val MAX_APK_BYTES = 200L * 1024 * 1024 // 200 Mo : un APK Cantoria fait quelques Mo
        const val PROGRESS_STEP_BYTES = 256L * 1024 // notification au moins tous les 256 Ko
    }

    interface Listener {
        fun onProgress(percent: Int)
        fun onDownloaded(apkFile: File)
        fun onError()
    }

    /* Handler créé paresseusement : le constructeur reste pur (aucune classe
       Android framework), donc testable en JVM unitaire locale — même
       discipline que UpdateChecker. */
    private var mainHandler: Handler? = null
    private var inFlight = false

    private fun handler(): Handler {
        mainHandler?.let { return it }
        val h = Handler(Looper.getMainLooper())
        mainHandler = h
        return h
    }

    /* La progression est calculée côté téléchargement (thread réseau) mais
       toujours livrée sur le thread principal. */
    fun download(apkUrl: String, destDir: File, fileName: String, listener: Listener) {
        if (inFlight) return
        if (!isAllowedUrl(apkUrl)) {
            notify(listener) { it.onError() }
            return
        }
        inFlight = true
        thread(start = true) {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(apkUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = READ_TIMEOUT_MS
                    setRequestProperty("User-Agent", "Cantoria-UpdateChecker")
                    instanceFollowRedirects = true
                }
                val code = connection.responseCode
                if (code != 200) {
                    notify(listener) { it.onError() }
                    return@thread
                }
                val total = connection.contentLengthLong // -1 si inconnu (chunked)
                if (total > MAX_APK_BYTES) {
                    notify(listener) { it.onError() }
                    return@thread
                }
                if (!destDir.exists() && !destDir.mkdirs()) {
                    notify(listener) { it.onError() }
                    return@thread
                }
                // Un seul APK à la fois : le téléchargement précédent est purgé.
                destDir.listFiles()?.forEach { it.delete() }
                val dest = File(destDir, fileName)
                val tmp = File(destDir, fileName + ".tmp")
                var downloaded = 0L
                var lastNotified = -1L
                connection.inputStream.use { input ->
                    tmp.outputStream().use { out: OutputStream ->
                        val buffer = ByteArray(16 * 1024)
                        while (downloaded < MAX_APK_BYTES) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            out.write(buffer, 0, read)
                            downloaded += read
                            // Écriture atomique : le fichier final n'existe
                            // que complet (principe n°1 de VISION, comme saveLibrary).
                            if (downloaded - lastNotified >= PROGRESS_STEP_BYTES || downloaded == total && total > 0) {
                                lastNotified = downloaded
                                val percent = if (total > 0) (downloaded * 100 / total).toInt() else 0
                                notify(listener) { it.onProgress(percent) }
                            }
                        }
                    }
                }
                if (downloaded <= 0 || (total > 0 && downloaded != total)) {
                    tmp.delete()
                    notify(listener) { it.onError() }
                    return@thread
                }
                if (!tmp.renameTo(dest)) {
                    tmp.delete()
                    notify(listener) { it.onError() }
                    return@thread
                }
                notify(listener) { it.onProgress(100) }
                notify(listener) { it.onDownloaded(dest) }
            } catch (e: Exception) {
                // Hors ligne, DNS, timeout, stockage plein : signalé à
                // l'interface (bandeau masqué, toast d'erreur) — jamais bloquant.
                notify(listener) { it.onError() }
            } finally {
                connection?.disconnect()
                inFlight = false
            }
        }
    }

    /* Restriction d'URL : l'APK ne peut venir que de GitHub Releases en HTTPS.
       L'URL provient déjà de l'API GitHub (UpdateChecker), mais la validation
       reste côté natif — la WebView ne fournit jamais une URL arbitraire. */
    fun isAllowedUrl(apkUrl: String): Boolean {
        if (!apkUrl.startsWith("https://")) return false
        return apkUrl.startsWith("https://github.com/") ||
            apkUrl.startsWith("https://objects.githubusercontent.com/") ||
            apkUrl.startsWith("https://release-assets.githubusercontent.com/")
    }

    private fun notify(listener: Listener, block: (Listener) -> Unit) {
        handler().post { block(listener) }
    }
}
