//"use strict";

var LibraryRWebAudio = {
   $RA: {
      numInstances: 0,
      instances: {},

      onaudioprocess: function(instance, audioProcessingEvent) {
         var outputBuffer = audioProcessingEvent.outputBuffer;
         var readSamples = {{{ makeDynCall('iiii') }}}(instance.callback, instance.audioProcessBuffer, instance.scriptProcessorNode.bufferSize, instance.userdata);

         if (outputBuffer.numberOfChannels != 2) {
            throw new Error("outputBuffer.numberOfChannels not 2!");
         }

         var left = outputBuffer.getChannelData(0);
         var right = outputBuffer.getChannelData(1);

         for (var sample = 0; sample < readSamples; sample++) {
            left[sample] = {{{ makeGetValue('instance.audioProcessBuffer', 'sample*8', 'float') }}};
            right[sample] = {{{ makeGetValue('instance.audioProcessBuffer', 'sample*8+4', 'float') }}};
         }

         if (instance.wakeup) {
            var wakeup = instance.wakeup;
            instance.wakeup = null;
            wakeup();
         }
      },
   },

   ScriptProcessorNodeInit__deps: ['$Browser', 'malloc'],
   ScriptProcessorNodeInit: function(latency, callback, userdata) {
      var instanceNum = RA.numInstances++;
      var instance = {};
      instance.context = new AudioContext();
      instance.gainNode = instance.context.createGain();
      instance.callback = callback;
      instance.userdata = userdata;
      instance.wakeup = null;
      instance.onaudioprocess = RA.onaudioprocess.bind(null, instance);

      instance.scriptProcessorNode = instance.context.createScriptProcessor(4096, 0, 2);
      instance.scriptProcessorNode.onaudioprocess = instance.onaudioprocess;
      instance.audioProcessBuffer = _malloc(instance.scriptProcessorNode.bufferSize * 8);

      instance.scriptProcessorNode.connect(instance.gainNode);
      instance.gainNode.connect(instance.context.destination);

      RA.instances[instanceNum] = instance;
      return instanceNum;
   },

   ScriptProcessorNodeSleep__deps: ['$Asyncify'],
   ScriptProcessorNodeSleep: function(i) {
      var instance = RA.instances[i];
      Asyncify.handleSleep(function(wakeUp) {
         instance.wakeup = wakeUp;
      });
   },

   ScriptProcessorNodeSampleRate: function(i) {
      var instance = RA.instances[i];
      return instance.context.sampleRate;
   },

   ScriptProcessorNodeStop: function(i) {
      var instance = RA.instances[i];
      instance.scriptProcessorNode.onaudioprocess = null;
      instance.gainNode.gain.setValueAtTime(0, instance.context.currentTime);
   },

   ScriptProcessorNodeStart: function(i) {
      var instance = RA.instances[i];
      instance.scriptProcessorNode.onaudioprocess = instance.onaudioprocess;
      instance.gainNode.gain.setValueAtTime(1, instance.context.currentTime);
   },

   ScriptProcessorNodeFree__deps: ['free'],
   ScriptProcessorNodeFree: function(i) {
      var instance = RA.instances[i];
      instance.gainNode.gain.setValueAtTime(0, instance.context.currentTime);
      instance.scriptProcessorNode.onaudioprocess = null;
      instance.context.close();
      _free(instance.audioProcessBuffer);
      delete RA.instances[i];
   },
};

autoAddDeps(LibraryRWebAudio, '$RA');
mergeInto(LibraryManager.library, LibraryRWebAudio);
