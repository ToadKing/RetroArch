class RWebAudioStream extends AudioWorkletProcessor {
   constructor(options) {
      super()
      this.size = options.processorOptions.bufferSize
      this.leftBuffer = new Float32Array(this.size)
      this.rightBuffer = new Float32Array(this.size)
      this.first = 0
      this.end = 0
      this.blockUntilWriteAvail = false
      this.port.onmessage = this.handleMessage_.bind(this)
      this.writeAvail = this.writeAvail_.bind(this)
   }

   writeAvail_() {
      return (this.size - 1) - ((this.end + ((this.end < this.first) ? this.size : 0)) - this.first)
   }

   handleMessage_(e) {
      switch (e.data.message) {
      case 'writeAvail':
         const writeAvail = this.writeAvail()

         if (writeAvail == 0 && e.data.block) {
            this.blockUntilWriteAvail = true
         } else {
            this.port.postMessage(writeAvail)
         }
         break
      case 'write':
         const { left, right } = e.data
         const size = left.length
         let first_write = size

         if (this.end + size > this.size)
         {
            first_write = this.size - this.end
         }

         this.leftBuffer.set(left.slice(0, first_write), this.end)
         this.leftBuffer.set(left.slice(first_write))

         this.rightBuffer.set(right.slice(0, first_write), this.end)
         this.rightBuffer.set(right.slice(first_write))

         this.end = (this.end + size) % this.size

         break
      }
   }

   process(inputs, outputs, parameters) {
      const [left, right] = outputs[0]
      const outputSize = left.length
      const readAvail = (this.end + ((this.end < this.first) ? this.size : 0)) - this.first
      const size = outputSize > readAvail ? readAvail : outputSize

      let first_read = size
      let rest_read  = 0

      if (this.first + size > this.size)
      {
         first_read = this.size - this.first
         rest_read  = size - first_read
      }

      left.set(this.leftBuffer.slice(this.first, this.first + first_read))
      left.set(this.leftBuffer.slice(0, rest_read), first_read)

      right.set(this.rightBuffer.slice(this.first, this.first + first_read))
      right.set(this.rightBuffer.slice(0, rest_read), first_read)

      this.first = (this.first + size) % this.size

      if (this.blockUntilWriteAvail) {
         const writeAvail = this.writeAvail()

         if (writeAvail != 0) {
            this.blockUntilWriteAvail = false
            this.port.postMessage(writeAvail)
         }
      }

      return true
   }
}

registerProcessor('rwebaudio-stream', RWebAudioStream)
