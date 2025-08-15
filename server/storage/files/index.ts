import env from "@server/env";
import LocalStorage from "./LocalStorage";
import S3Storage from "./S3Storage";
import CloudinaryStorage from "./CloudinaryStorage";

const storage = (() => {
  switch (env.FILE_STORAGE) {
    case "local":
      return new LocalStorage();
    case "cloudinary":
      return new CloudinaryStorage();
    case "s3":
    default:
      return new S3Storage();
  }
})();

export default storage;
