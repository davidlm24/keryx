// What every backend throws. Pages render err.message and sometimes check
// err.status (404 for a missing row, 501 for a feature not in this build).
export class ClientError extends Error {
    constructor(message, status, cause) {
        super(message);
        this.name = "ClientError";
        this.status = status;
        this.cause = cause;
    }
}
