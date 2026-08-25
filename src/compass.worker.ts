import {
  computeCompassFrame,
  type CachedCompassPlace,
  type CompassWorkerFriend,
  type CompassWorkerResult,
} from "./compass-compute";

type CompassWorkerMessage =
  | {
      type: "data";
      places: CachedCompassPlace[];
      friends: CompassWorkerFriend[];
      selfSteamId?: string;
      language: "en" | "vi";
    }
  | {
      type: "frame";
      requestId: number;
      position: { x: number; y: number };
      heading: number;
    };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CompassWorkerMessage>) => void) | null;
  postMessage: (message: CompassWorkerResult) => void;
};

let places: CachedCompassPlace[] = [];
let friends: CompassWorkerFriend[] = [];
let selfSteamId: string | undefined;
let language: "en" | "vi" = "vi";

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "data") {
    places = message.places;
    friends = message.friends;
    selfSteamId = message.selfSteamId;
    language = message.language;
    return;
  }

  workerScope.postMessage(computeCompassFrame({
    requestId: message.requestId,
    places,
    friends,
    selfSteamId,
    language,
    position: message.position,
    heading: message.heading,
  }));
};
