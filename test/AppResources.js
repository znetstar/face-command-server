const random = require("./random");

describe("AppResources", function () {
    describe("#constructor()", function () {
        it("should be able to create an AppResoures object successfully", async function () {
            await random.appResources();
        });
    });
});