import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
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

  postFiles(files: File[]): Observable<string>{

    let fileNames = files.map(x => x.name)

    return this.getPresignedURLs(fileNames).pipe(switchMap(results => {
      var tasks: Observable<any>[] = []
      files.forEach(sendFile => {
        let item = results['signedURLs'][sendFile.name]
        let url = item['url']

        const formData: FormData = new FormData()

        Object.entries(item['fields']).forEach(([key, value]) => {
          formData.append(key, String(value))
        })
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
