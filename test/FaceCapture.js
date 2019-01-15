const { assert } = require("chai");
const { imdecodeAsync } = require("opencv4nodejs");
const { TooManyFacesError, NoFacesDetectedError, ImageBelowBrightnessThresholdError } = require("..");
const random = require("./random");

describe("FaceCapture", function () {
    this.timeout(10000);
    describe("#constructor()", function () {
        it("should create a face capture object", async function () {
            await random.capture();
        });

        // it("should throw ClassifierDoesNotExistError if a non-existant classifier is specified", async function () {
        //     const res = await random.appResources();
        //     res.nconf.set("FaceCapture", random.chance.string());
        //     const f = () => new FaceCapture(res, random.chance.integer(), random.chance.string());

        //     assert.throws(f, ClassifierDoesNotExistError);
        // });
    });

    describe("#FacesFromImage()", function () {
        it("should return all faces detected in the image", async function () {
            const capture = await random.capture();
            const faces = await capture.FacesFromImage(await imdecodeAsync(await random.images.files["sampleGroup.jpg"]()));
            assert.isNotEmpty(faces);
        });
    });

    describe("#FaceFromImage()", function () {
        it("should return a single face", async function () {
            const capture = await random.capture();
            const face = await capture.FaceFromImage(await imdecodeAsync(await random.images.files["sample.jpg"]()));
            assert.ok(face);
        });

        // it("should throw if more than one face is in the input image", async function () {
        //     const capture = await random.capture();
        //     let fn = () => {}

        //     try {
        //         const f = await capture.FaceFromImage(await imdecodeAsync(await random.images.files["sampleGroup.jpg"]()));
        //         console.log(f)
        //     } catch (e) {
        //         fn = () => { throw e; }
        //     } finally {
        //         assert.throws(fn, TooManyFacesError);
        //     }
        // });

        it("should throw if no faces are detected in the input image", async function () {
            const capture = await random.capture();
            let fn = () => {}

            try {
                await capture.FaceFromImage(await imdecodeAsync(await random.images.files["sampleNoFaces.jpg"]()));
            } catch (e) {
                fn = () => { throw e; }
            } finally {
                assert.throws(fn, NoFacesDetectedError);
            }
        });
    });
    
    return 
    describe("#ResizeFace()", function () {
        it("should resize image to the specified dimensions", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);

            const size = random.chance.integer({ min: 100, max: 1000 });

            res.nconf.set("imageSize:height", size);
            res.nconf.set("imageSize:width", size);
            
            const image = await capture.ResizeFace(await imdecodeAsync(await random.images.files["sample.jpg"]()));
            assert.equal(size, image.rows);
            assert.equal(size, image.cols);
        });
    });

    describe("#GetBrightness()", function () {
        it("should return 0 if the image provided is solid black", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            
            const input = await imdecodeAsync(await random.images.files["black.png"]());
            const brightness = await capture.GetBrightness(await input.bgrToGrayAsync());
            assert.equal(0, brightness);
        });

        it("should return 1 if the image provided is solid white", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            
            const input = await imdecodeAsync(await random.images.files["white.png"]());
            const brightness = await capture.GetBrightness(await input.bgrToGrayAsync());
            assert.equal(1, brightness);
        });
    });

    describe("#StabilizeContrast()", function () {
        it("histogram equalization should be applied to a sample image", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            
            const input = await imdecodeAsync(await random.images.files["sample.jpg"]());
            const image = await capture.StabilizeContrast(await input.bgrToGrayAsync());
            
            const control = await imdecodeAsync((await random.images.files["sampleEqualized.png"]()));

            assert.deepEqual(control.getDataAsArray(), image.getDataAsArray());
        });
    });

    describe("#PreprocessFace()", function () {
        it("should reject image with low brightness", async function () {
            const res = await random.appResources();
            res.nconf.set("targetBrightness", 0.5);
            const capture = await random.capture(res);
            
            let fn = () => {};
            try {
                const input = await imdecodeAsync( await random.images.files["sampleDark.png"]() );
                await capture.PreprocessFace(await input.bgrToGrayAsync());
            }
            catch (e) {
                fn = () => { throw e; }
            }
            finally {
                assert.throws(fn, ImageBelowBrightnessThresholdError);
            }
        });

        it("should resize image", async function () {
            const res = await random.appResources();

            const size = 100;

            res.nconf.set("imageSize:width", size);
            res.nconf.set("imageSize:height", size);

            const capture = await random.capture(res);
            const input = await imdecodeAsync(await random.sampleImage());
            
            const result = await capture.PreprocessFace(await input.bgrToGrayAsync());
            assert.equal(size, result.cols);
            assert.equal(size, result.rows);
        });

        it("should apply histogram equalization", async function () {
            const res = await random.appResources();
            const capture = await random.capture(res);
            
            capture.ResizeFace = async (mat) => mat

            const input = await imdecodeAsync(await random.images.files["sample.jpg"]());
            const image = await capture.StabilizeContrast(await input.bgrToGrayAsync());
            
            const control = await imdecodeAsync((await random.images.files["sampleEqualized.png"]()));

            assert.deepEqual(control.getDataAsArray(), image.getDataAsArray());
        });
    });
});