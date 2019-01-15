 const { assert } = require("chai");
 const { ImageBelowBrightnessThresholdError } = require("..");
 const random = require("./random");

 describe("FaceManagementService", function () {
    describe("#constructor()", function () {
        it("should create successfully", async function () {
            await random.facesSvc();
        });
    });

    describe("#AddFace()", function () {
        this.timeout(10000);
        it("reject a dark image", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            res.nconf.set("minimumBrightness", 0.5);

            let fn = () => {};

            try {
                await faceSvc.AddFace(await random.images.files["sampleDark.png"](), random.chance.string(), false, true);
            } catch (e) {
                fn = () => { throw e; }
            } finally {
                assert.throws(fn, ImageBelowBrightnessThresholdError);
            }
        });

        it("successfully add a face image to the database", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            
            const image = new Uint8Array( await random.sampleImage() );
            const name = random.chance.string();
            const autostart = random.chance.bool();

            const face = await faceSvc.AddFace(image, name, autostart, false);

            assert.equal(name, face.name);
            assert.equal(autostart, face.autostart);
        });
    });

    describe("#AddFaceFromCamera()", function () {
        it("should successfully add a face from the capture source", async function () {
            this.timeout(10000);
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            
            const name = random.chance.string();
            const autostart = random.chance.bool();

            const face = await faceSvc.AddFaceFromCamera(name, autostart);

            assert.equal(name, face.name);
            assert.equal(autostart, face.autostart);         
        });
    });

    describe("#GetFace()", function () {
        it("should retrieve a face from the database", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            
            const image = new Uint8Array( await random.sampleImage() );
            const name = random.chance.string();
            const autostart = random.chance.bool();

            const addedFace = await faceSvc.AddFace(image, name, autostart, false);
            const face = await faceSvc.GetFace(addedFace.id);

            assert.deepEqual(addedFace, face);
        });
    });

    describe("#GetFaces()", function () {
        this.timeout(60000);
        it("should retrieve a list of faces from the database", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            
            const faces = [];
            for (let i = 0; i < random.chance.integer({ min: 1, max: 5 }); i++) {
                const image = new Uint8Array( await random.sampleImage() );
                const name = random.chance.string();
                const autostart = random.chance.bool();

                const addedFace = await faceSvc.AddFace(image, name, autostart, false);
                faces.push(addedFace);
            }
            
            const retFaces = await faceSvc.GetFaces();

            assert.deepEqual(faces, retFaces);
        });
    });

    describe("#RemoveFace()", function () {
        this.timeout(4000);
        it("should remove a face from the database", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            
            const image = new Uint8Array( await random.sampleImage() );
            const name = random.chance.string();
            const autostart = random.chance.bool();

            const addedFace = await faceSvc.AddFace(image, name, autostart, false);
            await faceSvc.RemoveFace(addedFace.id);

            assert.isEmpty(await faceSvc.GetFaces());
        });
    });

    describe("#UpdateFace()", function () {
        this.timeout(4000);
        it("should update an existing face in the database", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            const faceSvc = await random.facesSvc(res, capture);
            
            const image = new Uint8Array( await random.sampleImage() );
            const name = random.chance.string();
            const autostart = random.chance.bool();

            const addedFace = await faceSvc.AddFace(image, name, autostart, false);
            
            addedFace.name = random.chance.string();
            addedFace.autostart = random.chance.bool();

            const result = await faceSvc.UpdateFace(addedFace, false, true);
            assert.deepEqual(addedFace, result);
        });
    });
 });