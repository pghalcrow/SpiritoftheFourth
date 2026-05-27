import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, forkJoin, map } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FileServerService {

  constructor(private httpClient: HttpClient) {

  }


  getPresignedURLs(fileNames: string[]): Observable<any> {
    let payload: any = {
      "getSignedURLs": true,
      "fileNames": fileNames
    }
   
    let results = this.httpClient.post<any>(environment.email.url, payload);
    return results;

  }

  postFiles(files: File[]): Observable<any>{
    

    let fileNames = files.map(x => x.name)

    return this.getPresignedURLs(fileNames).pipe(map(results => {
      var tasks: Observable<any>[] = []
      files.forEach(sendFile => {
        let item = results['signedURLs'][sendFile.name]
        let url = item['url']
        let key = item['fields']['key']
        let securityToken = item['fields']['x-amz-security-token']
        let policy = item['fields']['policy']
        let signature = item['fields']['signature']
        let accessKey = item['fields']['AWSAccessKeyId']

        const formData: FormData = new FormData()

        formData.append('key', key)
        formData.append('AWSAccessKeyId', accessKey)
        formData.append('x-amz-security-token', securityToken)
        formData.append('policy', policy)
        formData.append('signature', signature)
        formData.append('file', sendFile, sendFile.name);
        tasks.push(this.httpClient.post<any>(url, formData))
      })
      return forkJoin(tasks)
      .pipe(map(() => { 
        return results['folderKey'];
      }))
    }));
  }
}
