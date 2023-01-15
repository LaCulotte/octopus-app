import { cp } from "fs";
import { OctopusApp } from "./app";

class CLIApp extends OctopusApp {
    type: string = "CLI";

    constructor(octopusUrl: string) {
        super(octopusUrl);
    }

    onInit(message: any) {
        let success = super.onInit(message);

        if(success)
            this.subscribeToBroadcast("twitchChatMessage")
                .then((msg) => { console.log("subscribed"); })
                .catch((err) => { console.log(`could not subscribe : ${err}`)});

        return success;
    }

    onBroadcast(message: any): void {
        super.onBroadcast(message);

        switch(message.channel) {
            case "twitchChatMessage":
                console.log("Twitch message!!");
                this.sendBroadcast("twitchWriteMessage", { channel: message.content.target, message: "AAAAAAAAAAA" })
                break;
            
            default:
                console.warn(`[${this.logHeader}] Unknown broadcast channel : ${message.channel}`);
                break;
        }
    }
}

let app = new CLIApp("ws://localhost:8000");
app.connect();