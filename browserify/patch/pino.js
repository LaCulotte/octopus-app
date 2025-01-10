class pinoMock {
    constructor(options) {
    }

    error(message) {
        console.error(message);
    }

    info(message) {
        console.log(message);
    }
}

module.exports = {
    pino: () => {
        return new pinoMock();
    }
}
