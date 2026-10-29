// CantoriaBridge — pont JS équivalent window.carnetDesktop (issue #54).
// Exposé à la page sous window.cantoriaAndroid ; un petit shim dans le HTML
// (injecté par la page elle-même au chargement, sans modification de cantoria.html)
// l'adapte au contrat window.carnetDesktop attendu par l'interface.
//
// Discipline identique à preload.js côté desktop : chaque méthode valide ses
// entrées, aucune méthode d'écriture sans garde de taille, zéro réseau ici
// (la vérification de version est l'issue #57, pilotée par le natif).
package fr.cantoria.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File

class CantoriaBridge(private val activity: Activity) {

    companion object {
        const val REQUEST_OPEN_DOCUMENT = 4101
        const val REQUEST_SAVE_DOCUMENT = 4102
        const val MAX_TRANSFER_BYTES = 20L * 1024 * 1024 // 20 Mo, comme le desktop
        const val LIBRARY_FILE = "cantoria-library.json"
        const val BACKUP_DIR = "backups"
        const val BACKUP_KEEP = 30
    }

    // ---- Informations ----

    @JavascriptInterface
    fun platform(): String = "android"

    @JavascriptInterface
    fun getAppVersion(): String =
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""

    // ---- Bibliothèque : fichier privé du stockage de l'app (issue #56) ----
    // Équivalent Android du backup:write-daily côté écriture directe : le
    // carnet vit dans filesDir (pas de quota localStorage ~5 Mo), MODE_PRIVATE.
    // Le format (JSON, cantoria-songs-v1) est identique côté interface — le
    // pont ne fait que transporter la chaîne, jamais l'interpréter.

    @JavascriptInterface
    fun saveLibrary(json: String): Boolean {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_TRANSFER_BYTES) return false
        return try {
            val tmp = File(activity.filesDir, LIBRARY_FILE + ".tmp")
            tmp.writeText(json, Charsets.UTF_8)
            // Écriture atomique : le carnet valide n'est jamais écrasé par un
            // fichier à moitié écrit (principe n°1 de VISION).
            val dest = File(activity.filesDir, LIBRARY_FILE)
            if (!tmp.renameTo(dest)) {
                val fos = activity.openFileOutput(LIBRARY_FILE, Activity.MODE_PRIVATE)
                fos.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                tmp.delete()
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun loadLibrary(): String {
        return try {
            val f = File(activity.filesDir, LIBRARY_FILE)
            if (!f.exists()) "" else f.readText(Charsets.UTF_8)
        } catch (e: Exception) {
            ""
        }
    }

    // ---- Écran (équivalent powerSaveBlocker du desktop) ----

    @JavascriptInterface
    fun setScrolling(scrolling: Boolean) {
        activity.runOnUiThread {
            if (scrolling) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    // ---- Stockage privé (équivalent backup:write-daily du desktop) ----

    @JavascriptInterface
    fun writeDailyBackup(json: String): Boolean {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_TRANSFER_BYTES) return false
        return try {
            val dir = File(activity.filesDir, BACKUP_DIR)
            if (!dir.exists()) dir.mkdirs()
            val today = java.time.LocalDate.now().toString()
            File(dir, "cantoria-backup-$today.json").writeText(json, Charsets.UTF_8)
            pruneOldBackups(dir)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun pruneOldBackups(dir: File) {
        val cutoff = System.currentTimeMillis() - BACKUP_KEEP * 24L * 60 * 60 * 1000
        dir.listFiles()?.forEach { f ->
            val m = Regex("cantoria-backup-(\\d{4}-\\d{2}-\\d{2})\\.json").find(f.name)
            if (m != null) {
                val ts = java.time.LocalDate.parse(m.groupValues[1])
                    .atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
                if (ts < cutoff) f.delete()
            }
        }
    }

    // ---- Import / Export (Storage Access Framework — aucune permission requise) ----

    private var pendingOpenCallback: String? = null

    @JavascriptInterface
    fun openDocument() {
        // L'interface appelle openDocument puis lit window.cantoriaAndroid.takeOpenedDocument()
        // (polling léger) : le SAF est asynchrone et ne peut pas retourner de valeur.
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                "application/json", "text/plain", "text/*", "application/octet-stream"
            ))
        }
        pendingOpenCallback = "pending"
        activity.startActivityForResult(intent, REQUEST_OPEN_DOCUMENT)
    }

    @JavascriptInterface
    fun takeOpenedDocument(): String {
        val result = pendingOpenCallback ?: "null"
        pendingOpenCallback = null
        return result
    }

    @JavascriptInterface
    fun saveJson(json: String): Boolean {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_TRANSFER_BYTES) return false
        return try {
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/json"
                putExtra(Intent.EXTRA_TITLE, "cantoria.json")
            }
            pendingSaveContent = json
            activity.startActivityForResult(intent, REQUEST_SAVE_DOCUMENT)
            true
        } catch (e: Exception) {
            false
        }
    }

    private var pendingSaveContent: String? = null

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        when (requestCode) {
            REQUEST_OPEN_DOCUMENT -> {
                val uri = data?.data
                pendingOpenCallback = if (uri != null && resultCode == Activity.RESULT_OK) {
                    readUriAsJson(uri)
                } else "null"
                return true
            }
            REQUEST_SAVE_DOCUMENT -> {
                val uri = data?.data
                val content = pendingSaveContent
                pendingSaveContent = null
                if (uri != null && content != null && resultCode == Activity.RESULT_OK) {
                    writeUri(uri, content)
                }
                return true
            }
        }
        return false
    }

    private fun readUriAsJson(uri: Uri): String {
        return try {
            val size = querySize(uri)
            if (size > MAX_TRANSFER_BYTES) return "null"
            activity.contentResolver.openInputStream(uri)?.use { input ->
                val bytes = input.readBytes()
                val text = String(bytes, Charsets.UTF_8)
                // Format attendu par importContent : {"content": "...", "fileName": "..."}
                val name = queryDisplayName(uri)
                val escaped = text.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", "\\n").replace("\r", "").replace("\t", "\\t")
                "{\"content\":\"$escaped\",\"fileName\":\"$name\"}"
            } ?: "null"
        } catch (e: Exception) {
            "null"
        }
    }

    private fun querySize(uri: Uri): Long {
        return try {
            activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (idx >= 0 && cursor.moveToFirst()) cursor.getLong(idx) else 0L
            } ?: 0L
        } catch (e: Exception) {
            0L
        }
    }

    private fun queryDisplayName(uri: Uri): String {
        return try {
            activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) ?: "import.json"
                else "import.json"
            } ?: "import.json"
        } catch (e: Exception) {
            "import.json"
        }
    }

    private fun writeUri(uri: Uri, content: String) {
        try {
            activity.contentResolver.openOutputStream(uri)?.use { out ->
                out.write(content.toByteArray(Charsets.UTF_8))
            }
            activity.runOnUiThread {
                Toast.makeText(activity, "Carnet exporté", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            activity.runOnUiThread {
                Toast.makeText(activity, "Erreur pendant l'export", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
