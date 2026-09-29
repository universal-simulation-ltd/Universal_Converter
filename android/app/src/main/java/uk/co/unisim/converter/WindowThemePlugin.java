package uk.co.unisim.converter;

import android.content.Context;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Repaints the strips around the web view to match the app's own Light / Dark
 * theme (called from src/lib/systemBars.ts).
 *
 * On a WebView older than Chromium 140, Capacitor's SystemBars pads the web
 * view out from under the status bar, the camera cutout and the navigation
 * bar, and those strips show the WINDOW background. Android 15 ignores a
 * status-bar colour set at run time, so the only way to colour them is that
 * background. SystemBars itself repaints the decor view from the theme's
 * `android:windowBackground` on every setStyle and every configuration change
 * (rotation, the phone's dark mode), so painting the view directly would be
 * undone at the next turn of the phone. Instead this lays a theme overlay
 * (values/styles.xml: WindowStrip.Light / WindowStrip.Dark) over the
 * activity's theme, and SystemBars' own repaint then picks up the right colour.
 *
 * The choice is remembered, so a Dark user's next launch starts dark rather
 * than flashing white until the page has loaded.
 */
@CapacitorPlugin(name = "WindowTheme")
public class WindowThemePlugin extends Plugin {

    private static final String PREFS = "unisim_window_theme";
    private static final String KEY_DARK = "dark";

    @Override
    public void load() {
        super.load();
        // Runs inside BridgeActivity.onCreate, after its setTheme and before
        // SystemBars' first (posted) repaint, which will read the overlay.
        boolean dark = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DARK, false);
        if (!dark) return;
        applyOverlay(true);
        // SystemBars starts the glyphs at capacitor.config.ts's LIGHT (dark
        // glyphs). Its initial style was posted before this, so this runs after
        // it and gives the dark strip light glyphs until the page takes over.
        getBridge().executeOnMainThread(() -> setLightGlyphs(false));
    }

    @PluginMethod
    public void set(PluginCall call) {
        String theme = call.getString("theme", "light");
        boolean dark = "dark".equals(theme);
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DARK, dark).apply();
        getBridge().executeOnMainThread(() -> {
            applyOverlay(dark);
            call.resolve();
        });
    }

    private void applyOverlay(boolean dark) {
        getActivity().getTheme().applyStyle(dark ? R.style.WindowStrip_Dark : R.style.WindowStrip_Light, true);
        getActivity().getWindow().getDecorView().setBackgroundColor(getContext().getColor(dark ? R.color.unisimWindowBackgroundDark : R.color.unisimWindowBackground));
    }

    private void setLightGlyphs(boolean light) {
        Window window = getActivity().getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
    }
}
