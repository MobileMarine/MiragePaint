declare module 'imagetracerjs' {
  export interface ImageTracerOptions {
    numberofcolors?: number;
    pathomit?: number;
    ltres?: number;
    qtres?: number;
    blurradius?: number;
    blurdelta?: number;
    roundcoords?: number;
    scale?: number;
    strokewidth?: number;
    linefilter?: boolean;
    rightangleenhance?: boolean;
    colorsampling?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    [key: string]: unknown;
  }

  export interface ImageTracerApi {
    imagedataToSVG(imgd: ImageData, options?: ImageTracerOptions | string): string;
    imageToSVG(
      url: string,
      callback: (svg: string) => void,
      options?: ImageTracerOptions | string,
    ): void;
    checkoptions(options?: ImageTracerOptions | string): ImageTracerOptions;
  }

  const ImageTracer: ImageTracerApi;
  export default ImageTracer;
}
