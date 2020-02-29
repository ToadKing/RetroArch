/*  RetroArch - A frontend for libretro.
 *  Copyright (C) 2010-2015 - Michael Lelli
 *  Copyright (C) 2011-2017 - Daniel De Matteis
 *
 *  RetroArch is free software: you can redistribute it and/or modify it under the terms
 *  of the GNU General Public License as published by the Free Software Found-
 *  ation, either version 3 of the License, or (at your option) any later version.
 *
 *  RetroArch is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 *  without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 *  PURPOSE.  See the GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License along with RetroArch.
 *  If not, see <http://www.gnu.org/licenses/>.
 */
#include <stdlib.h>

#include <boolean.h>

#include <queues/fifo_queue.h>

#include "../../retroarch.h"

typedef size_t (*ScriptProcessorNodeCallback)(void *data, size_t bytes, void *userdata);

void *ScriptProcessorNodeInit(unsigned latency, ScriptProcessorNodeCallback callback, void *userdata);
void ScriptProcessorNodeSleep(void *instance);
unsigned ScriptProcessorNodeSampleRate(void *instance);
void ScriptProcessorNodeFree(void *instance);
void ScriptProcessorNodeStop(void *instance);
void ScriptProcessorNodeStart(void *instance);

typedef struct rwebaudio_t
{
   void *script_processor_node;
   bool nonblock;
   bool is_paused;

   fifo_buffer_t *buffer;
   size_t buffer_size;
} rwebaudio_t;

static size_t rwebaudio_audio_cb(void *data, size_t samples, void *userdata)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)userdata;

   size_t bytes = samples * 8;
   size_t avail = fifo_read_avail(rwebaudio->buffer);
   size_t read_size = bytes > avail ? avail : bytes;
   size_t read_samples = read_size / 8;

   fifo_read(rwebaudio->buffer, data, read_samples * 8);

   return read_samples;
}

static void *rwebaudio_init(const char *device, unsigned rate, unsigned latency,
      unsigned block_frames,
      unsigned *new_rate)
{
   (void)device;
   (void)rate;
   (void)block_frames;

   rwebaudio_t *rwebaudio = (rwebaudio_t*)calloc(1, sizeof(rwebaudio_t));
   if (!rwebaudio)
      return NULL;

   rwebaudio->script_processor_node = ScriptProcessorNodeInit(latency, rwebaudio_audio_cb, rwebaudio);
   *new_rate = ScriptProcessorNodeSampleRate(rwebaudio->script_processor_node);


   rwebaudio->buffer_size = (*new_rate * latency / 1000) * 8;
   rwebaudio->buffer = fifo_new(rwebaudio->buffer_size);

   return rwebaudio;
}

static ssize_t rwebaudio_write(void *data, const void *buf, size_t size)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;

   if (rwebaudio->nonblock)
   {
      size_t avail, write_amt;

      avail = fifo_write_avail(rwebaudio->buffer);

      write_amt = avail > size ? size : avail;

      fifo_write(rwebaudio->buffer, buf, write_amt);
      return write_amt;
   }
   else
   {
      size_t written = 0;
      while (written < size)
      {
         size_t avail;

         avail = fifo_write_avail(rwebaudio->buffer);

         if (avail == 0)
         {
            ScriptProcessorNodeSleep(rwebaudio->script_processor_node);
         }
         else
         {
            size_t write_amt = size - written > avail ? avail : size - written;
            fifo_write(rwebaudio->buffer, (const char*)buf + written, write_amt);
            written += write_amt;
         }
      }
      return written;
   }
}

static bool rwebaudio_stop(void *data)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;
   rwebaudio->is_paused = true;
   ScriptProcessorNodeStop(rwebaudio->script_processor_node);

   return true;
}

static void rwebaudio_set_nonblock_state(void *data, bool state)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;
   rwebaudio->nonblock = state;
}

static bool rwebaudio_alive(void *data)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;
   if (rwebaudio)
      return !rwebaudio->is_paused;
   return false;
}

static bool rwebaudio_start(void *data, bool is_shutdown)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;
   rwebaudio->is_paused = false;
   ScriptProcessorNodeStart(rwebaudio->script_processor_node);

   return true;
}

static void rwebaudio_free(void *data)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;

   fifo_free(rwebaudio->buffer);
   ScriptProcessorNodeFree(rwebaudio->script_processor_node);

   free(rwebaudio);
}

static size_t rwebaudio_write_avail(void *data)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;

   return fifo_write_avail(rwebaudio->buffer);
}

static size_t rwebaudio_buffer_size(void *data)
{
   rwebaudio_t *rwebaudio = (rwebaudio_t*)data;
   return rwebaudio->buffer_size;
}

static bool rwebaudio_use_float(void *data)
{
   (void)data;
   return true;
}

audio_driver_t audio_rwebaudio = {
   rwebaudio_init,
   rwebaudio_write,
   rwebaudio_stop,
   rwebaudio_start,
   rwebaudio_alive,
   rwebaudio_set_nonblock_state,
   rwebaudio_free,
   rwebaudio_use_float,
   "rwebaudio",
   NULL,
   NULL,
   rwebaudio_write_avail,
   rwebaudio_buffer_size,
};
