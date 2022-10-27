// Code used under the Apache License 2.0, http://www.apache.org/licenses/LICENSE-2.0

/**
 * It takes a data URI, a filename, and a MIME type, and then it creates a link element, sets the href
 * attribute to the data URI, sets the download attribute to the filename, appends the link to the
 * body, clicks the link, and then removes the link from the body
 * @param data - The data you want to download.
 * @param strFileName - The name of the file you want to download.
 * @param strMimeType - The MIME type of the file. If you don't specify it, it will be set to
 * application/octet-stream.
 * @returns The function download is being returned.
 */
function download(data, strFileName, strMimeType) {

    /* Declaring variables. */
    var self = window,
        u = "application/octet-stream",
        m = strMimeType || u,
        x = data,
        D = document,
        a = D.createElement("a"),
        z = function (a) { return String(a); },
        B = self.Blob || self.MozBlob || self.WebKitBlob || z,
        BB = self.MSBlobBuilder || self.WebKitBlobBuilder || self.BlobBuilder,
        fn = strFileName || "download",
        blob,
        b,
        ua,
        fr;

    /* Checking if the function is called with the `new` keyword. If it is, it is swapping the
    arguments. */
    if (String(this) === "true") {
        x = [x, m];
        m = x[0];
        x = x[1];
    }

    /* Checking if the data is a data URI. If it is, it is saving the data URI. */
    if (String(x).match(/^data\:[\w+\-]+\/[\w+\-]+[,;]/)) {
        return navigator.msSaveBlob ?
            navigator.msSaveBlob(d2b(x), fn) :
            saver(x);
    }

    /* Checking if the data is a data URI. If it is, it is saving the data URI. */
    try {

        blob = x instanceof B ?
            x :
            new B([x], { type: m });
    }
    /* A fallback for browsers that don't support the Blob constructor. */
    catch (y) {
        if (BB) {
            b = new BB();
            b.append([x]);
            blob = b.getBlob(m);
        }

    }



    /**
     * This function takes a data URI and returns a Blob object.
     * @param u - The data URI string
     * @returns A Blob object.
     */
    function d2b(u) {
        var p = u.split(/[:;,]/),
            t = p[1],
            dec = p[2] == "base64" ? atob : decodeURIComponent,
            bin = dec(p.pop()),
            mx = bin.length,
            i = 0,
            uia = new Uint8Array(mx);

        for (i; i < mx; ++i) uia[i] = bin.charCodeAt(i);

        return new B([uia], { type: t });
    }

    /**
     * It creates a link element, sets the href attribute to the url, sets the download attribute to
     * the filename, appends the link to the body, clicks the link, and then removes the link from the
     * body
     * @param url - The URL of the file you want to download.
     * @param winMode - Boolean, if true, it opens a new window with the image/PDF.
     * @returns The function saver is being returned.
     */
    function saver(url, winMode) {


        /* Creating a link element and clicking it. */
        if ('download' in a) {
            a.href = url;
            a.setAttribute("download", fn);
            a.innerHTML = "downloading...";
            D.body.appendChild(a);
            setTimeout(function () {
                a.click();
                D.body.removeChild(a);
                if (winMode === true) { setTimeout(function () { self.URL.revokeObjectURL(a.href); }, 250); }
            }, 66);
            return true;
        }

        /* Creating an iframe and appending it to the body. */
        var f = D.createElement("iframe");
        D.body.appendChild(f);
        if (!winMode) {
            url = "data:" + url.replace(/^data:([\w\/\-\+]+)/, u);
        }


        /* Creating an iframe and appending it to the body. */
        f.src = url;
        setTimeout(function () { D.body.removeChild(f); }, 333);

    }


    /* Checking if the browser supports the msSaveBlob function. If it does, it is using it. */
    if (navigator.msSaveBlob) {
        return navigator.msSaveBlob(blob, fn);
    }

    /* Checking if the browser supports the URL.createObjectURL function. If it does, it is using it. */
    if (self.URL) {
        saver(self.URL.createObjectURL(blob), true);
    }
    /* Converting the blob to a data URI. */
    else {
        if (typeof blob === "string" || blob.constructor === z) {
            try {
                return saver("data:" + m + ";base64," + self.btoa(blob));
            } catch (y) {
                return saver("data:" + m + "," + encodeURIComponent(blob));
            }
        }
        fr = new FileReader();
        fr.onload = function (e) {
            saver(this.result);
        };
        fr.readAsDataURL(blob);
    }
    return true;
}
