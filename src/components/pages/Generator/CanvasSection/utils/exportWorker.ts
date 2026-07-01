import {buildMapsZip} from './maps/buildMapsZip';
import {type MapDepth} from './maps/types';

export type ExportRequest = {
  heights: Float32Array;
  width: number;
  height: number;
  palette: Uint8Array;
  include: Record<string, boolean>;
  depths: Record<string, MapDepth>;
  params: Record<string, Record<string, number>>;
  memberNames: Record<string, string>;
};

export type ExportResponse =
  | {type: 'progress'; fraction: number}
  | {type: 'done'; zip: Uint8Array};

// Dedicated-worker global. Casting avoids pulling in the "webworker" TS lib,
// which conflicts with the project's "dom" lib.
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null;
  postMessage: (message: ExportResponse, transfer?: Transferable[]) => void;
};

worker.onmessage = (event) => {
  const zip = buildMapsZip({
    ...event.data,
    onProgress: (fraction) => {
      worker.postMessage({type: 'progress', fraction});
    },
  });
  worker.postMessage({type: 'done', zip}, [zip.buffer]);
};
