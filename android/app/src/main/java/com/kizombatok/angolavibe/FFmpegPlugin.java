package com.kizombatok.angolavibe;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.PluginMethod;

import com.arthenica.ffmpegkit.FFmpegKit;

@CapacitorPlugin(name = "FFmpegPlugin")
public class FFmpegPlugin extends Plugin {

    @PluginMethod
    public void merge(PluginCall call) {

        String video = call.getString("video");
        String audio = call.getString("audio");
        String output = call.getString("output");

        // Comando otimizado para dublagem: remove áudio original e insere a música
        // -map 0:v:0 -> vídeo do primeiro input
        // -map 1:a:0 -> áudio do segundo input
        String command = "-i " + video + " -i " + audio +
                " -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -y " + output;

        FFmpegKit.executeAsync(command, session -> {
            if (session.getReturnCode().isSuccess()) {
                call.resolve();
            } else {
                call.reject("FFmpeg execution failed with return code: " + session.getReturnCode());
            }
        });
    }
}
