import fileSaver from 'file-saver'

export default {
  exportSave(res, filename) {
    const headers = res.headers
    const des = headers['content-disposition'] || headers['Content-Disposition'] || headers['CONTENT-DISPOSITION'];
    if (des && !filename) {
      filename = des.split('filename=')[1]
    }
    const blob = new Blob([res.data], {type: 'application/vnd.ms-excel'});
    fileSaver.saveAs(blob, decodeURI(filename));
  },
  exportZipSave(res, filename) {
    const blob = new Blob([res.data])
    let link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob)
    link.target = '_blank'
    link.download = decodeURI(filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }}
