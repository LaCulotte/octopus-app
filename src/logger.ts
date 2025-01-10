import { pino } from 'pino'
import pretty from 'pino-pretty'

export var logger = pino({
    transport: {
        target: "pino-pretty"
    },
});

// export var logger = pino(pretty)

export function resetLogger(options: pretty.PrettyOptions) {
    logger = pino(pretty(options))
}
