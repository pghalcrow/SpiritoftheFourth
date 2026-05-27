import { UploadFile } from "../models/upload-file"

export class FileUtility {
    public static async getUploadDatafromFiles(files: File[]) {
        let promiseList: Promise<UploadFile>[] = []

        files.forEach(async file => 
            {
                promiseList.push(this.getFileInfo(file))
            })

        return await Promise.all(promiseList)

    }





    private static async getFileInfo(file: File) {

        return new Promise<UploadFile>((resolve, reject) => {

            var reader = new FileReader();

            reader.readAsDataURL(file);

            reader.onload = () => {

                let res = reader.result as String

                let resp = new UploadFile
                resp.fileName = file.name
                resp.type = file.name.split('.').pop()!
                resp.base64 = res.substr(res.indexOf(',') + 1)

                resolve(resp)

            }

        })

    }

}