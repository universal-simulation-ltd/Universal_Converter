package uk.co.unisim.converter;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Local plugins register before super.onCreate builds the bridge.
        registerPlugin(WindowThemePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
