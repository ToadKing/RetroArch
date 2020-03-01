var LibraryRWebAudio = {
   $RA: {
      numInstances: 0,
      instances: {},

      handleMessage: function(instance, e) {
         var writeAvail = e.data * 4 * 2;

         if (instance.wakeUp) {
            var wakeUp = instance.wakeUp;
            instance.wakeUp = null;
            wakeUp(writeAvail);
         }
      },
   },

   ScriptProcessorNodeInit__deps: ['$Browser', '$Asyncify'],
   ScriptProcessorNodeInit: function(latency) {
      var instanceNum = RA.numInstances++;
      var instance = {};
      instance.context = new AudioContext();
      instance.bufferSize = instance.context.sampleRate * latency / 1000;
      instance.gainNode = instance.context.createGain();
      instance.wakeUp = null;

      RA.instances[instanceNum] = instance;

      return Asyncify.handleSleep(function(wakeUp) {
         instance.context.audioWorklet.addModule('rwebaudio_worklet.js').then(function() {
            instance.worklet = new AudioWorkletNode(instance.context, 'rwebaudio-stream', {
               numberOfInputs: 0,
               numberOfOutputs: 1,
               outputChannelCount: [2],
               processorOptions: {
                  bufferSize: instance.bufferSize,
               },
            });

            instance.worklet.port.onmessage = RA.handleMessage.bind(null, instance)

            instance.worklet.connect(instance.gainNode)
            instance.gainNode.connect(instance.context.destination);
         }).finally(function() {
            wakeUp(instanceNum);
         });
      });
   },

   ScriptProcessorNodeWriteAvail__deps: ['$Asyncify'],
   ScriptProcessorNodeWriteAvail: function(i, block) {
      var instance = RA.instances[i];
      return Asyncify.handleSleep(function(wakeUp) {
         instance.wakeUp = wakeUp;
         instance.worklet.port.postMessage({ message: 'writeAvail', block: block });
      });
   },

   ScriptProcessorNodeWrite: function(i, left, right, len) {
      var instance = RA.instances[i];

      var leftFloats = new Float32Array(Module.HEAPF32.buffer.slice(left, left + len * 4));
      var rightFloats = new Float32Array(Module.HEAPF32.buffer.slice(right, right + len * 4));

      instance.worklet.port.postMessage({ message: 'write', left: leftFloats, right: rightFloats }, [leftFloats.buffer, rightFloats.buffer]);
   },

   ScriptProcessorNodeSampleRate: function(i) {
      var instance = RA.instances[i];
      return instance.context.sampleRate;
   },

   ScriptProcessorNodeBufferSize: function(i) {
      var instance = RA.instances[i];
      return instance.bufferSize * 4 * 2;
   },

   ScriptProcessorNodeStop: function(i) {
      var instance = RA.instances[i];
      instance.gainNode.gain.setValueAtTime(0, instance.context.currentTime);
   },

   ScriptProcessorNodeStart: function(i) {
      var instance = RA.instances[i];
      instance.gainNode.gain.setValueAtTime(1, instance.context.currentTime);
   },

   ScriptProcessorNodeFree: function(i) {
      var instance = RA.instances[i];
      instance.gainNode.gain.setValueAtTime(0, instance.context.currentTime);
      instance.context.close();
      delete RA.instances[i];
   },
};

autoAddDeps(LibraryRWebAudio, '$RA');
mergeInto(LibraryManager.library, LibraryRWebAudio);
