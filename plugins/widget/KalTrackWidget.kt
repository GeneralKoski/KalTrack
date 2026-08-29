package PACKAGE_NAME

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import android.widget.RemoteViews
import java.io.File
import java.text.NumberFormat
import java.util.Calendar
import java.util.Locale

/**
 * Widget della home: kcal rimaste oggi e passi.
 *
 * Legge DIRETTAMENTE il database dell'app. Un widget vive in un processo che
 * non ha un runtime JavaScript, quindi non puo' chiedere i numeri al codice
 * dell'app: o li legge da se', o mostra dati copiati altrove che invecchiano
 * in silenzio. Stesso package e stesso UID, quindi il file e' accessibile.
 *
 * NON scrive mai. L'apertura e' in lettura/scrittura solo perche' il database
 * e' in modalita' WAL: aprendolo in sola lettura SQLite non puo' creare il
 * file -shm quando manca, e la lettura fallirebbe dopo un checkpoint.
 *
 * Limite dichiarato: Android aggiorna un widget al massimo ogni 30 minuti, e
 * l'app non ha modo di svegliarlo prima senza un modulo nativo. Subito dopo
 * aver segnato un pasto il widget puo' quindi mostrare il totale precedente.
 */
class KalTrackWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        manager: AppWidgetManager,
        widgetIds: IntArray,
    ) {
        for (id in widgetIds) render(context, manager, id)
    }

    /**
     * Al cambio di data il widget deve ridisegnarsi subito.
     * Senza questo, dopo mezzanotte mostrerebbe fino a mezz'ora i totali di
     * ieri: un numero vecchio e' peggio di nessun numero, perche' sembra
     * aggiornato.
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val refreshes = intent.action == Intent.ACTION_DATE_CHANGED ||
            intent.action == Intent.ACTION_TIME_CHANGED ||
            intent.action == Intent.ACTION_TIMEZONE_CHANGED
        if (!refreshes) return

        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(
            ComponentName(context, KalTrackWidget::class.java),
        )
        onUpdate(context, manager, ids)
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.kaltrack_widget)
        val summary = readSummary(context)

        views.setTextViewText(R.id.widget_kcal, summary.kcalText)
        views.setTextViewText(R.id.widget_kcal_caption, summary.kcalCaption)
        views.setTextViewText(R.id.widget_steps, summary.stepsText)

        // Il tocco apre l'app: un widget che non porta da nessuna parte
        // costringe a cercare l'icona subito dopo averlo guardato.
        val launch = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (launch != null) {
            views.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(
                    context,
                    0,
                    launch,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }

        manager.updateAppWidget(id, views)
    }

    private data class Summary(
        val kcalText: String,
        val kcalCaption: String,
        val stepsText: String,
    )

    /** Quando il dato non c'e' si scrive un trattino: uno zero sarebbe una bugia. */
    private val unknown = Summary("—", "kcal rimaste", "— passi")

    private fun readSummary(context: Context): Summary {
        val path = File(context.filesDir, "SQLite/kaltrack.db")
        if (!path.exists()) return unknown

        var db: SQLiteDatabase? = null
        return try {
            db = SQLiteDatabase.openDatabase(
                path.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE,
            )
            val today = todayIso()

            val target = queryDouble(
                db,
                "SELECT kcal FROM targets WHERE valid_from <= ? AND deleted_at IS NULL " +
                    "ORDER BY valid_from DESC LIMIT 1",
                arrayOf(today),
            )
            val eaten = queryDouble(
                db,
                "SELECT SUM(e.kcal) FROM meal_entries e " +
                    "JOIN meals m ON m.id = e.meal_id " +
                    "WHERE m.date = ? AND m.deleted_at IS NULL AND e.deleted_at IS NULL",
                arrayOf(today),
            ) ?: 0.0
            val steps = queryDouble(
                db,
                "SELECT steps FROM step_logs WHERE date = ? AND deleted_at IS NULL",
                arrayOf(today),
            )

            val numbers = NumberFormat.getIntegerInstance(Locale.ITALY)
            Summary(
                kcalText = if (target == null) {
                    numbers.format(Math.round(eaten))
                } else {
                    numbers.format(Math.round(target - eaten))
                },
                kcalCaption = if (target == null) "kcal oggi" else "kcal rimaste",
                stepsText = if (steps == null) {
                    "— passi"
                } else {
                    numbers.format(steps.toLong()) + " passi"
                },
            )
        } catch (error: Exception) {
            // Un widget che si schianta viene disegnato come rettangolo grigio
            // dal launcher: meglio i trattini e una riga di log.
            Log.w("KalTrackWidget", "lettura del riepilogo fallita", error)
            unknown
        } finally {
            db?.close()
        }
    }

    private fun queryDouble(
        db: SQLiteDatabase,
        sql: String,
        args: Array<String>,
    ): Double? = db.rawQuery(sql, args).use { cursor ->
        if (!cursor.moveToFirst() || cursor.isNull(0)) null else cursor.getDouble(0)
    }

    /** La data del calendario LOCALE, la stessa che usa il diario. */
    private fun todayIso(): String {
        val now = Calendar.getInstance()
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            now.get(Calendar.YEAR),
            now.get(Calendar.MONTH) + 1,
            now.get(Calendar.DAY_OF_MONTH),
        )
    }
}
