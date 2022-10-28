var defaultUrl = localStorageGetItem("api-url") || "https://ce.judge0.com";
var apiUrl = defaultUrl;
var wait = localStorageGetItem("wait") || true;
var check_timeout = 300;

var blinkStatusLine = ((localStorageGetItem("blink") || "true") === "true");
var editorMode = localStorageGetItem("editorMode") || "normal";
var editorModeObject = null;

var fontSize = 16;

var MonacoVim;
var MonacoEmacs;

var layout;

var sourceEditor;
var stdinEditor;
var stdoutEditor;

var isEditorDirty = false;
var currentLanguageId;

var $selectLanguage;
var $compilerOptions;
var $commandLineArguments;
var $insertTemplateBtn;
var $runBtn;
var $navigationMessage;
var $updates;
var $statusLine;

var timeStart;
var timeEnd;

var messagesData;

/* Making a GET request to the URL https://judge0-ce.p.rapidapi.com/about and printing the response to
the console. */
const options = {
    method: 'GET',
    headers: {
        'X-RapidAPI-Key': 'ffb9c2d9f6mshfad2fc0a4e441eep1172cfjsn084467c6d725',
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
    }
};

fetch('https://judge0-ce.p.rapidapi.com/about', options)
    .then(response => response.json())
    .then(response => console.log(response))
    .catch(err => console.error(err));

/* Creating a layout with two columns. The first column has two rows. The first row is a component with
the name "source" and the second row is a stack with two components. The first component is named
"stdin" and the second component is named "stdout". */
var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: true
    },
    dimensions: {
        borderWidth: 3,
        headerHeight: 22
    },
    content: [{
        type: "column",
        content: [{
            type: "component",
            height: 70,
            componentName: "source",
            id: "source",
            title: "SOURCE",
            isClosable: false,
            componentState: {
                readOnly: false
            }
        }, {
            type: "stack",
            content: [{
                type: "component",
                componentName: "stdin",
                id: "stdin",
                title: "Input",
                isClosable: false,
                componentState: {
                    readOnly: false
                }
            }, {
                type: "component",
                componentName: "stdout",
                id: "stdout",
                title: "Output",
                isClosable: false,
                componentState: {
                    readOnly: true
                }
            }]
        }]
    }]
};

/**
 * It takes a string, encodes it as a URI component, escapes any special characters, converts it to
 * base64, and returns the result
 * @param str - The string to be encoded.
 * @returns the base64 encoded string.
 */
function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

/**
 * It decodes a base64 string into a string, and if the string is not UTF-8, it will try to decode it
 * as if it were UTF-8
 * @param bytes - The string to decode.
 * @returns the decoded string.
 */
function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

/**
 * If the browser supports localStorage, then store the value in localStorage. If the browser doesn't
 * support localStorage, then do nothing
 * @param key - The key to store the value under.
 * @param value - The value to be stored.
 */
function localStorageSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (ignorable) {
    }
}

/**
 * If the browser supports localStorage, return the value of the key, otherwise return null
 * @param key - The key to retrieve from localStorage.
 * @returns The value of the key in localStorage.
 */
function localStorageGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (ignorable) {
        return null;
    }
}

/**
 * It takes a JSON object, and then it creates a string of HTML that is then inserted into the DOM
 * @returns the value of the variable combinedMessage.
 */
function showMessages() {
    var width = $updates.offset().left - parseFloat($updates.css("padding-left")) -
        $navigationMessage.parent().offset().left - parseFloat($navigationMessage.parent().css("padding-left")) - 5;

    if (width < 200 || messagesData === undefined) {
        return;
    }

    var messages = messagesData["messages"];

    $navigationMessage.css("animation-duration", messagesData["duration"]);
    $navigationMessage.parent().width(width - 5);

    var combinedMessage = "";
    for (var i = 0; i < messages.length; ++i) {
        combinedMessage += `${messages[i]}`;
        if (i != messages.length - 1) {
            combinedMessage += "&nbsp".repeat(Math.min(200, messages[i].length));
        }
    }

    $navigationMessage.html(combinedMessage);
}

/**
 * It loads the messages.json file from the server and stores it in the messagesData variable
 */
function loadMessages() {
    $.ajax({
        url: `https://minio.judge0.com/public/ide/messages.json?${Date.now()}`,
        type: "GET",
        headers: {
            "Accept": "application/json"
        },
        success: function (data, textStatus, jqXHR) {
            messagesData = data;
            showMessages();
        }
    });
}

/**
 * It takes two parameters, and then it sets the title and content of the modal to the parameters, and
 * then it shows the modal.
 * @param title - The title of the modal
 * @param content - The content of the modal.
 */
function showError(title, content) {
    $("#site-modal #title").html(title);
    $("#site-modal .content").html(content);
    $("#site-modal").modal("show");
}

/**
 * If the request fails, show the error message and the response body.
 * @param jqXHR - The jQuery XMLHttpRequest (jqXHR) object returned by $.ajax() as of jQuery 1.5 is a
 * superset of the browser's native XMLHttpRequest object. For example, it contains responseText and
 * responseXML properties, as well as a getResponseHeader()
 * @param textStatus - "error"
 * @param errorThrown - The exception thrown if an error occurs while processing the request (for
 * example, a 404 error).
 */
function handleError(jqXHR, textStatus, errorThrown) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

/**
 * If the request fails, call the handleError function and remove the loading class from the run
 * button.
 * @param jqXHR - The jQuery XMLHttpRequest (jqXHR) object returned by $.ajax() as of jQuery 1.5 is a
 * superset of the browser's native XMLHttpRequest object. For example, it contains responseText and
 * responseXML properties, as well as a getResponseHeader()
 * @param textStatus - "error"
 * @param errorThrown - "Internal Server Error"
 */
function handleRunError(jqXHR, textStatus, errorThrown) {
    handleError(jqXHR, textStatus, errorThrown);
    $runBtn.removeClass("loading");
}

/**
 * It takes the data from the server and displays it in the browser
 * @param data - the data returned from the server
 */
function handleResult(data) {
    timeEnd = performance.now();
    console.log("It took " + (timeEnd - timeStart) + " ms to get submission result.");

    var status = data.status;
    var stdout = decode(data.stdout);
    var compile_output = decode(data.compile_output);
    var time = (data.time === null ? "-" : data.time + "s");
    var memory = (data.memory === null ? "-" : data.memory + "KB");

    $statusLine.html(`${status.description}, ${time}, ${memory}`);

    if (blinkStatusLine) {
        $statusLine.addClass("blink");
        setTimeout(function () {
            blinkStatusLine = false;
            localStorageSetItem("blink", "false");
            $statusLine.removeClass("blink");
        }, 3000);
    }

    var output = [compile_output, stdout].join("\n").trim();

    stdoutEditor.setValue(output);

    if (output !== "") {
        var dot = document.getElementById("stdout-dot");
        if (!dot.parentElement.classList.contains("lm_active")) {
            dot.hidden = false;
        }
    }

    $runBtn.removeClass("loading");
}

/**
 * It takes the URI, removes the first character (the question mark), trims any whitespace, splits the
 * string into an array of strings, and returns the first element of that array.
 * @returns The first parameter in the query string.
 */
function getIdFromURI() {
    var uri = location.search.substr(1).trim();
    return uri.split("&")[0];
}

/**
 * It takes the value of the selected language, and then downloads the source code of the editor with
 * the file name of the selected language.
 */
function downloadSource() {
    var value = parseInt($selectLanguage.val());
    download(sourceEditor.getValue(), fileNames[value], "text/plain");
}

/**
 * It takes the id from the url and uses it to get the source code from the database
 */
function loadSavedSource() {
    snippet_id = getIdFromURI();

    if (snippet_id.length == 36) {
        $.ajax({
            url: apiUrl + "/submissions/" + snippet_id + "?fields=source_code,language_id,stdin,stdout,stderr,compile_output,message,time,memory,status,compiler_options,command_line_arguments&base64_encoded=true",
            type: "GET",
            success: function (data, textStatus, jqXHR) {
                sourceEditor.setValue(decode(data["source_code"]));
                $selectLanguage.dropdown("set selected", data["language_id"]);
                $compilerOptions.val(data["compiler_options"]);
                $commandLineArguments.val(data["command_line_arguments"]);
                stdinEditor.setValue(decode(data["stdin"]));
                stdoutEditor.setValue(decode(data["stdout"]));
                var time = (data.time === null ? "-" : data.time + "s");
                var memory = (data.memory === null ? "-" : data.memory + "KB");
                $statusLine.html(`${data.status.description}, ${time}, ${memory}`);
                changeEditorLanguage();
            },
            error: handleRunError
        });
    } else {
        loadRandomLanguage();
    }
}

/**
 * It sends a POST request to the API endpoint, and if the response is successful, it calls the
 * handleResult function
 * @returns The response is a JSON object with the following keys:
 */
function run() {
    /* Checking if the source code is empty or not. If it is empty, it will show an error message. If
    it is not empty, it will add a loading class to the run button. */
    if (sourceEditor.getValue().trim() === "") {
        showError("Error", "Source code can't be empty!");
        return;
    } else {
        $runBtn.addClass("loading");
    }

    document.getElementById("stdout-dot").hidden = true;

    stdoutEditor.setValue("");

    var x = layout.root.getItemsById("stdout")[0];
    x.parent.header.parent.setActiveContentItem(x);

    var sourceValue = encode(sourceEditor.getValue());
    var stdinValue = encode(stdinEditor.getValue());
    var languageId = resolveLanguageId($selectLanguage.val());
    var compilerOptions = $compilerOptions.val();
    var commandLineArguments = $commandLineArguments.val();

    /* Getting the value of the source editor. */
    if (parseInt(languageId) === 44) {
        sourceValue = sourceEditor.getValue();
    }

    var data = {
        source_code: sourceValue,
        language_id: languageId,
        stdin: stdinValue,
        compiler_options: compilerOptions,
        command_line_arguments: commandLineArguments,
        redirect_stderr_to_stdout: true
    };

    /* Sending a request to the server. */
    var sendRequest = function (data) {
        timeStart = performance.now();
        $.ajax({
            url: apiUrl + `/submissions?base64_encoded=true&wait=${wait}`,
            type: "POST",
            async: true,
            contentType: "application/json",
            data: JSON.stringify(data),
            xhrFields: {
                withCredentials: apiUrl.indexOf("/secure") != -1 ? true : false
            },
            success: function (data, textStatus, jqXHR) {
                console.log(`Your submission token is: ${data.token}`);
                if (wait == true) {
                    handleResult(data);
                } else {
                    setTimeout(fetchSubmission.bind(null, data.token), check_timeout);
                }
            },
            error: handleRunError
        });
    }

    var fetchAdditionalFiles = false;

    /* Fetching the sqliteAdditionalFiles.base64.txt file from the minio.judge0.com server and storing
    it in the sqliteAdditionalFiles variable. */
    if (parseInt(languageId) === 82) {
        if (sqliteAdditionalFiles === "") {
            fetchAdditionalFiles = true;
            $.ajax({
                url: `https://minio.judge0.com/public/ide/sqliteAdditionalFiles.base64.txt?${Date.now()}`,
                type: "GET",
                async: true,
                contentType: "text/plain",
                success: function (responseData, textStatus, jqXHR) {
                    sqliteAdditionalFiles = responseData;
                    data["additional_files"] = sqliteAdditionalFiles;
                    sendRequest(data);
                },
                error: handleRunError
            });
        }
        else {
            data["additional_files"] = sqliteAdditionalFiles;
        }
    }

    /* Checking if the fetchAdditionalFiles variable is false. If it is, it calls the sendRequest
    function. */
    if (!fetchAdditionalFiles) {
        sendRequest(data);
    }
}

/**
 * It takes a submission token as an argument, and then uses that token to make an AJAX call to the
 * API. If the status of the submission is in queue or processing, it will wait for a certain amount of
 * time and then make the call again. If the status is anything else, it will call the handleResult
 * function.
 * @param submission_token - The token of the submission you want to check.
 * @returns The response is a JSON object with the following fields:
 */
function fetchSubmission(submission_token) {
    $.ajax({
        url: apiUrl + "/submissions/" + submission_token + "?base64_encoded=true",
        type: "GET",
        async: true,
        success: function (data, textStatus, jqXHR) {
            if (data.status.id <= 2) { // In Queue or Processing
                setTimeout(fetchSubmission.bind(null, submission_token), check_timeout);
                return;
            }
            handleResult(data);
        },
        error: handleRunError
    });
}

/**
 * It changes the language of the editor to the language selected in the dropdown menu
 */
function changeEditorLanguage() {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("mode"));
    currentLanguageId = parseInt($selectLanguage.val());
    $(".lm_title")[0].innerText = fileNames[currentLanguageId];
    apiUrl = resolveApiUrl($selectLanguage.val());
}

/**
 * It sets the source code, input, and compiler options to the values of the selected language
 */
function insertTemplate() {
    currentLanguageId = parseInt($selectLanguage.val());
    sourceEditor.setValue(sources[currentLanguageId]);
    stdinEditor.setValue(inputs[currentLanguageId] || "");
    $compilerOptions.val(compilerOptions[currentLanguageId] || "");
    changeEditorLanguage();
}

/**
 * Load a random language from the dropdown menu and set it as the selected value.
 */
function loadRandomLanguage() {
    var values = [];
    for (var i = 0; i < $selectLanguage[0].options.length; ++i) {
        values.push($selectLanguage[0].options[i].value);
    }
    // $selectLanguage.dropdown("set selected", values[Math.floor(Math.random() * $selectLanguage[0].length)]);
    $selectLanguage.dropdown("set selected", values[19]);
    apiUrl = resolveApiUrl($selectLanguage.val())
    insertTemplate();
}

/**
 * If the editor is in full screen mode, then the height of the editor is reduced by the height of the
 * status line.
 * @param layoutInfo - The layoutInfo object that is passed to the resize event.
 */
function resizeEditor(layoutInfo) {
    if (editorMode != "normal") {
        var statusLineHeight = $("#editor-status-line").height();
        layoutInfo.height -= statusLineHeight;
        layoutInfo.contentHeight -= statusLineHeight;
    }
}

/**
 * If the editorModeObject exists, dispose of it.
 */
function disposeEditorModeObject() {
    try {
        editorModeObject.dispose();
        editorModeObject = null;
    } catch (ignorable) {
    }
}

/**
 * If the editor mode is "vim", then create a new Vim editor mode object and assign it to the
 * editorModeObject variable. Otherwise, if the editor mode is "emacs", then create a new Emacs editor
 * mode object and assign it to the editorModeObject variable.
 */
function changeEditorMode() {
    disposeEditorModeObject();

    if (editorMode == "vim") {
        editorModeObject = MonacoVim.initVimMode(sourceEditor, $("#editor-status-line")[0]);
    } else if (editorMode == "emacs") {
        var statusNode = $("#editor-status-line")[0];
        editorModeObject = new MonacoEmacs.EmacsExtension(sourceEditor);
        editorModeObject.onDidMarkChange(function (e) {
            statusNode.textContent = e ? "Mark Set!" : "Mark Unset";
        });
        editorModeObject.onDidChangeKey(function (str) {
            statusNode.textContent = str;
        });
        editorModeObject.start();
    }
}

/**
 * It takes a language ID and returns the language ID
 * @param id - The language ID to resolve.
 * @returns The languageIdTable[id] or id.
 */
function resolveLanguageId(id) {
    id = parseInt(id);
    return languageIdTable[id] || id;
}

/**
 * If the id is a number, return the languageApiUrlTable[id] value, otherwise return the defaultUrl
 * value.
 * @param id - The id of the language you want to get the API URL for.
 * @returns The value of the key in the languageApiUrlTable object that matches the id parameter. If
 * there is no match, the defaultUrl is returned.
 */
function resolveApiUrl(id) {
    id = parseInt(id);
    return languageApiUrlTable[id] || defaultUrl;
}

/**
 * It updates the font size of the three editors
 * @param fontSize - The font size in pixels.
 */
function editorsUpdateFontSize(fontSize) {
    sourceEditor.updateOptions({ fontSize: fontSize });
    stdinEditor.updateOptions({ fontSize: fontSize });
    stdoutEditor.updateOptions({ fontSize: fontSize });
}

/**
 * If the window width is less than or equal to 1200 pixels, hide all elements with the class "wide
 * screen only". Otherwise, show them.
 */
function updateScreenElements() {
    var display = window.innerWidth <= 1200 ? "none" : "";
    $(".wide.screen.only").each(function (index) {
        $(this).css("display", display);
    });
}

/* Updating the size of the layout and the screen elements. */
$(window).resize(function () {
    layout.updateSize();
    updateScreenElements();
    showMessages();
});

$(document).ready(function () {
    updateScreenElements();

    console.log("Hey, Vikasak IDE is brand-new and open-source: https://github.com/DrInfinite/onlineIDE. We would love to hear your thoughts and inputs!");

    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (e) {
        if (!isEditorDirty) {
            insertTemplate();
        } else {
            changeEditorLanguage();
        }
    });

    $compilerOptions = $("#compiler-options");
    $commandLineArguments = $("#command-line-arguments");
    $commandLineArguments.attr("size", $commandLineArguments.attr("placeholder").length);

    $insertTemplateBtn = $("#insert-template-btn");
    $insertTemplateBtn.click(function (e) {
        if (isEditorDirty && confirm("Are you sure? Your current changes will be lost.")) {
            insertTemplate();
        }
    });

    $runBtn = $("#run-btn");
    $runBtn.click(function (e) {
        run();
    });

    $navigationMessage = $("#navigation-message span");
    $updates = $("#vikasak-more");

    $(`input[name="editor-mode"][value="${editorMode}"]`).prop("checked", true);
    $("input[name=\"editor-mode\"]").on("change", function (e) {
        editorMode = e.target.value;
        localStorageSetItem("editorMode", editorMode);

        resizeEditor(sourceEditor.getLayoutInfo());
        changeEditorMode();

        sourceEditor.focus();
    });

    $statusLine = $("#status-line");

    $(document).on("keydown", "body", function (e) {
        var keyCode = e.keyCode || e.which;
        if (keyCode == 120) { // F9
            e.preventDefault();
            run();
        } else if (keyCode == 119) { // F8
            e.preventDefault();
            var url = prompt("Enter URL of Judge0 Compiler API:", apiUrl);
            if (url != null) {
                url = url.trim();
            }
            if (url != null && url != "") {
                apiUrl = url;
                localStorageSetItem("api-url", apiUrl);
            }
        } else if (keyCode == 118) { // F7
            e.preventDefault();
            wait = !wait;
            localStorageSetItem("wait", wait);
            alert(`Submission wait is ${wait ? "ON. Enjoy" : "OFF"}.`);
        } else if (event.ctrlKey && keyCode == 107) { // Ctrl++
            e.preventDefault();
            fontSize += 1;
            editorsUpdateFontSize(fontSize);
        } else if (event.ctrlKey && keyCode == 109) { // Ctrl+-
            e.preventDefault();
            fontSize -= 1;
            editorsUpdateFontSize(fontSize);
        }
    });

    $("select.dropdown").dropdown();
    $(".ui.dropdown").dropdown();
    $(".ui.dropdown.site-links").dropdown({ action: "hide", on: "hover" });
    $(".ui.checkbox").checkbox();
    $(".message .close").on("click", function () {
        $(this).closest(".message").transition("fade");
    });

    loadMessages();

    require(["vs/editor/editor.main", "monaco-vim", "monaco-emacs"], function (ignorable, MVim, MEmacs) {
        layout = new GoldenLayout(layoutConfig, $("#site-content"));

        MonacoVim = MVim;
        MonacoEmacs = MEmacs;

        /* Creating a Monaco Editor in the container. */
        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                minimap: {
                    enabled: false
                }
            });

            changeEditorMode();

            sourceEditor.getModel().onDidChangeContent(function (e) {
                currentLanguageId = parseInt($selectLanguage.val());
                isEditorDirty = sourceEditor.getValue() != sources[currentLanguageId];
            });

            sourceEditor.onDidLayoutChange(resizeEditor);
        });

        /* Creating a Monaco editor in the container. */
        layout.registerComponent("stdin", function (container, state) {
            stdinEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });
        });

        /* Creating a Monaco Editor instance and appending it to the container. */
        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });

            container.on("tab", function (tab) {
                tab.element.append("<span id=\"stdout-dot\" class=\"dot\" hidden></span>");
                tab.element.on("mousedown", function (e) {
                    e.target.closest(".lm_tab").children[3].hidden = true;
                });
            });
        });

        /* Adding the status bar to the editor. */
        layout.on("initialised", function () {
            $(".monaco-editor")[0].appendChild($("#editor-status-line")[0]);
            if (getIdFromURI()) {
                loadSavedSource();
            } else {
                loadRandomLanguage();
            }
            $("#site-navigation").css("border-bottom", "1px solid black");
            sourceEditor.focus();
            editorsUpdateFontSize(fontSize);
        });

        layout.init();
    });
});

/* Defining the template source code for each language. */
var assemblySource = "\
section	.text\n\
    global _start\n\
\n\
_start:\n\
\n\
    xor	eax, eax\n\
    lea	edx, [rax+len]\n\
    mov	al, 1\n\
    mov	esi, msg\n\
    mov	edi, eax\n\
    syscall\n\
\n\
    xor	edi, edi\n\
    lea	eax, [rdi+60]\n\
    syscall\n\
\n\
section	.rodata\n\
\n\
msg	db 'hello, world', 0xa\n\
len	equ	$ - msg\n\
";

var bashSource = "echo \"hello, world\"";

var basicSource = "PRINT \"hello, world\"";

var cSource = "\
// Powered by Judge0 Programming Language API\n\
#include <stdio.h>\n\
\n\
int main(void) {\n\
    printf(\"Hello Vikasak!\\n\");\n\
    return 0;\n\
}\n\
";

var csharpSource = "\
public class Hello {\n\
    public static void Main() {\n\
        System.Console.WriteLine(\"hello, world\");\n\
    }\n\
}\n\
";

var cppSource = "\
#include <iostream>\n\
\n\
int main() {\n\
    std::cout << \"hello, world\" << std::endl;\n\
    return 0;\n\
}\n\
";

var competitiveProgrammingSource = "\
#include <algorithm>\n\
#include <cstdint>\n\
#include <iostream>\n\
#include <limits>\n\
#include <set>\n\
#include <utility>\n\
#include <vector>\n\
\n\
using Vertex    = std::uint16_t;\n\
using Cost      = std::uint16_t;\n\
using Edge      = std::pair< Vertex, Cost >;\n\
using Graph     = std::vector< std::vector< Edge > >;\n\
using CostTable = std::vector< std::uint64_t >;\n\
\n\
constexpr auto kInfiniteCost{ std::numeric_limits< CostTable::value_type >::max() };\n\
\n\
auto dijkstra( Vertex const start, Vertex const end, Graph const & graph, CostTable & costTable )\n\
{\n\
    std::fill( costTable.begin(), costTable.end(), kInfiniteCost );\n\
    costTable[ start ] = 0;\n\
\n\
    std::set< std::pair< CostTable::value_type, Vertex > > minHeap;\n\
    minHeap.emplace( 0, start );\n\
\n\
    while ( !minHeap.empty() )\n\
    {\n\
        auto const vertexCost{ minHeap.begin()->first  };\n\
        auto const vertex    { minHeap.begin()->second };\n\
\n\
        minHeap.erase( minHeap.begin() );\n\
\n\
        if ( vertex == end )\n\
        {\n\
            break;\n\
        }\n\
\n\
        for ( auto const & neighbourEdge : graph[ vertex ] )\n\
        {\n\
            auto const & neighbour{ neighbourEdge.first };\n\
            auto const & cost{ neighbourEdge.second };\n\
\n\
            if ( costTable[ neighbour ] > vertexCost + cost )\n\
            {\n\
                minHeap.erase( { costTable[ neighbour ], neighbour } );\n\
                costTable[ neighbour ] = vertexCost + cost;\n\
                minHeap.emplace( costTable[ neighbour ], neighbour );\n\
            }\n\
        }\n\
    }\n\
\n\
    return costTable[ end ];\n\
}\n\
\n\
int main()\n\
{\n\
    constexpr std::uint16_t maxVertices{ 10000 };\n\
\n\
    Graph     graph    ( maxVertices );\n\
    CostTable costTable( maxVertices );\n\
\n\
    std::uint16_t testCases;\n\
    std::cin >> testCases;\n\
\n\
    while ( testCases-- > 0 )\n\
    {\n\
        for ( auto i{ 0 }; i < maxVertices; ++i )\n\
        {\n\
            graph[ i ].clear();\n\
        }\n\
\n\
        std::uint16_t numberOfVertices;\n\
        std::uint16_t numberOfEdges;\n\
\n\
        std::cin >> numberOfVertices >> numberOfEdges;\n\
\n\
        for ( auto i{ 0 }; i < numberOfEdges; ++i )\n\
        {\n\
            Vertex from;\n\
            Vertex to;\n\
            Cost   cost;\n\
\n\
            std::cin >> from >> to >> cost;\n\
            graph[ from ].emplace_back( to, cost );\n\
        }\n\
\n\
        Vertex start;\n\
        Vertex end;\n\
\n\
        std::cin >> start >> end;\n\
\n\
        auto const result{ dijkstra( start, end, graph, costTable ) };\n\
\n\
        if ( result == kInfiniteCost )\n\
        {\n\
            std::cout << \"NO\\n\";\n\
        }\n\
        else\n\
        {\n\
            std::cout << result << '\\n';\n\
        }\n\
    }\n\
\n\
    return 0;\n\
}\n\
";

var clojureSource = "(println \"hello, world\")\n";

var cobolSource = "\
IDENTIFICATION DIVISION.\n\
PROGRAM-ID. MAIN.\n\
PROCEDURE DIVISION.\n\
DISPLAY \"hello, world\".\n\
STOP RUN.\n\
";

var lispSource = "(write-line \"hello, world\")";

var dSource = "\
import std.stdio;\n\
\n\
void main()\n\
{\n\
    writeln(\"hello, world\");\n\
}\n\
";

var elixirSource = "IO.puts \"hello, world\"";

var erlangSource = "\
main(_) ->\n\
    io:fwrite(\"hello, world\\n\").\n\
";

var executableSource = "\
Vikasak assumes that content of executable is Base64 encoded.\n\
\n\
This means that you should Base64 encode content of your binary,\n\
paste it here and click \"Run\".\n\
\n\
Here is an example of compiled \"hello, world\" NASM program.\n\
";

var fsharpSource = "printfn \"hello, world\"\n";

var fortranSource = "\
program main\n\
    print *, \"hello, world\"\n\
end\n\
";

var goSource = "\
package main\n\
\n\
import \"fmt\"\n\
\n\
func main() {\n\
    fmt.Println(\"hello, world\")\n\
}\n\
";

var groovySource = "println \"hello, world\"\n";

var haskellSource = "main = putStrLn \"hello, world\"";

var javaSource = "\
public class Main {\n\
    public static void main(String[] args) {\n\
        System.out.println(\"hello, world\");\n\
    }\n\
}\n\
";

var javaScriptSource = "console.log(\"hello, world\");";

var kotlinSource = "\
fun main() {\n\
    println(\"hello, world\")\n\
}\n\
";

var luaSource = "print(\"hello, world\")";

var objectiveCSource = "\
#import <Foundation/Foundation.h>\n\
\n\
int main() {\n\
    @autoreleasepool {\n\
        char name[10];\n\
        scanf(\"%s\", name);\n\
        NSString *message = [NSString stringWithFormat:@\"hello, %s\\n\", name];\n\
        printf(\"%s\", message.UTF8String);\n\
    }\n\
    return 0;\n\
}\n\
";

var ocamlSource = "print_endline \"hello, world\"";

var octaveSource = "printf(\"hello, world\\n\");";

var pascalSource = "\
program Hello;\n\
begin\n\
    writeln ('hello, world')\n\
end.\n\
";

var perlSource = "\
my $name = <STDIN>;\n\
print \"hello, $name\";\n\
";

var phpSource = "\
<?php\n\
print(\"hello, world\\n\");\n\
?>\n\
";

var plainTextSource = "hello, world\n";

var prologSource = "\
:- initialization(main).\n\
main :- write('hello, world\\n').\n\
";

var pythonSource = "print(\"hello, world\")";

var rSource = "cat(\"hello, world\\n\")";

var rubySource = "puts \"hello, world\"";

var rustSource = "\
fn main() {\n\
    println!(\"hello, world\");\n\
}\n\
";

var scalaSource = "\
object Main {\n\
    def main(args: Array[String]) = {\n\
        val name = scala.io.StdIn.readLine()\n\
        println(\"hello, \"+ name)\n\
    }\n\
}\n\
";

var sqliteSource = "\
-- On Vikasak your SQL script is run on chinook database (https://www.sqlitetutorial.net/sqlite-sample-database).\n\
SELECT\n\
    Name, COUNT(*) AS num_albums\n\
FROM artists JOIN albums\n\
ON albums.ArtistID = artists.ArtistID\n\
GROUP BY Name\n\
ORDER BY num_albums DESC\n\
LIMIT 4;\n\
";
var sqliteAdditionalFiles = "";

var swiftSource = "\
import Foundation\n\
let name = readLine()\n\
print(\"hello, \\(name!)\")\n\
";

var typescriptSource = "console.log(\"hello, world\");";

var vbSource = "\
Public Module Program\n\
   Public Sub Main()\n\
      Console.WriteLine(\"hello, world\")\n\
   End Sub\n\
End Module\n\
";

var c3Source = "\
// On Vikasak, C3 is automatically\n\
// updated every hour to the latest commit on master branch.\n\
module main;\n\
\n\
extern func void printf(char *str, ...);\n\
\n\
func int main()\n\
{\n\
    printf(\"hello, world\\n\");\n\
    return 0;\n\
}\n\
";

var javaTestSource = "\
import static org.junit.jupiter.api.Assertions.assertEquals;\n\
\n\
import org.junit.jupiter.api.Test;\n\
\n\
class MainTest {\n\
    static class Calculator {\n\
        public int add(int x, int y) {\n\
            return x + y;\n\
        }\n\
    }\n\
\n\
    private final Calculator calculator = new Calculator();\n\
\n\
    @Test\n\
    void addition() {\n\
        assertEquals(2, calculator.add(1, 1));\n\
    }\n\
}\n\
";

var mpiccSource = "\
// Try adding \"-n 5\" (without quotes) into command line arguments. \n\
#include <mpi.h>\n\
\n\
#include <stdio.h>\n\
\n\
int main()\n\
{\n\
    MPI_Init(NULL, NULL);\n\
\n\
    int world_size;\n\
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);\n\
\n\
    int world_rank;\n\
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);\n\
\n\
    printf(\"Hello from processor with rank %d out of %d processors.\\n\", world_rank, world_size);\n\
\n\
    MPI_Finalize();\n\
\n\
    return 0;\n\
}\n\
";

var mpicxxSource = "\
// Try adding \"-n 5\" (without quotes) into command line arguments. \n\
#include <mpi.h>\n\
\n\
#include <iostream>\n\
\n\
int main()\n\
{\n\
    MPI_Init(NULL, NULL);\n\
\n\
    int world_size;\n\
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);\n\
\n\
    int world_rank;\n\
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);\n\
\n\
    std::cout << \"Hello from processor with rank \"\n\
              << world_rank << \" out of \" << world_size << \" processors.\\n\";\n\
\n\
    MPI_Finalize();\n\
\n\
    return 0;\n\
}\n\
";

var mpipySource = "\
# Try adding \"-n 5\" (without quotes) into command line arguments. \n\
from mpi4py import MPI\n\
\n\
comm = MPI.COMM_WORLD\n\
world_size = comm.Get_size()\n\
world_rank = comm.Get_rank()\n\
\n\
print(f\"Hello from processor with rank {world_rank} out of {world_size} processors\")\n\
";

var nimSource = "\
# On Vikasak, Nim is automatically\n\
# updated every day to the latest stable version.\n\
echo \"hello, world\"\n\
";

var pythonForMlSource = "\
import mlxtend\n\
import numpy\n\
import pandas\n\
import scipy\n\
import sklearn\n\
\n\
print(\"hello, world\")\n\
";

var bosqueSource = "\
// On Vikasak IDE, Bosque (https://github.com/microsoft/BosqueLanguage)\n\
// is automatically updated every hour to the latest commit on master branch.\n\
\n\
namespace NSMain;\n\
\n\
concept WithName {\n\
    invariant $name != \"\";\n\
\n\
    field name: String;\n\
}\n\
\n\
concept Greeting {\n\
    abstract method sayHello(): String;\n\
    \n\
    virtual method sayGoodbye(): String {\n\
        return \"goodbye\";\n\
    }\n\
}\n\
\n\
entity GenericGreeting provides Greeting {\n\
    const instance: GenericGreeting = GenericGreeting@{};\n\
\n\
    override method sayHello(): String {\n\
        return \"hello world\";\n\
    }\n\
}\n\
\n\
entity NamedGreeting provides WithName, Greeting {\n\
    override method sayHello(): String {\n\
        return String::concat(\"hello\", \" \", this.name);\n\
    }\n\
}\n\
\n\
entrypoint function main(arg?: String): String {\n\
    var val = arg ?| \"\";\n\
    if (val == \"1\") {\n\
        return GenericGreeting@{}.sayHello();\n\
    }\n\
    elif (val == \"2\") {\n\
        return GenericGreeting::instance.sayHello();\n\
    }\n\
    else {\n\
        return NamedGreeting@{name=\"bob\"}.sayHello();\n\
    }\n\
}\n\
";

var cppTestSource = "\
#include <gtest/gtest.h>\n\
\n\
int add(int x, int y) {\n\
    return x + y;\n\
}\n\
\n\
TEST(AdditionTest, NeutralElement) {\n\
    EXPECT_EQ(1, add(1, 0));\n\
    EXPECT_EQ(1, add(0, 1));\n\
    EXPECT_EQ(0, add(0, 0));\n\
}\n\
\n\
TEST(AdditionTest, CommutativeProperty) {\n\
    EXPECT_EQ(add(2, 3), add(3, 2));\n\
}\n\
\n\
int main(int argc, char **argv) {\n\
    ::testing::InitGoogleTest(&argc, argv);\n\
    return RUN_ALL_TESTS();\n\
}\n\
";

var csharpTestSource = "\
using NUnit.Framework;\n\
\n\
public class Calculator\n\
{\n\
    public int add(int a, int b)\n\
    {\n\
        return a + b;\n\
    }\n\
}\n\
\n\
[TestFixture]\n\
public class Tests\n\
{\n\
    private Calculator calculator;\n\
\n\
    [SetUp]\n\
    protected void SetUp()\n\
    {\n\
        calculator = new Calculator();\n\
    }\n\
\n\
    [Test]\n\
    public void NeutralElement()\n\
    {\n\
        Assert.AreEqual(1, calculator.add(1, 0));\n\
        Assert.AreEqual(1, calculator.add(0, 1));\n\
        Assert.AreEqual(0, calculator.add(0, 0));\n\
    }\n\
\n\
    [Test]\n\
    public void CommutativeProperty()\n\
    {\n\
        Assert.AreEqual(calculator.add(2, 3), calculator.add(3, 2));\n\
    }\n\
}\n\
";

/* A dictionary of source codes. */
var sources = {
    45: assemblySource,
    46: bashSource,
    47: basicSource,
    48: cSource,
    49: cSource,
    50: cSource,
    51: csharpSource,
    52: cppSource,
    53: cppSource,
    54: competitiveProgrammingSource,
    55: lispSource,
    56: dSource,
    57: elixirSource,
    58: erlangSource,
    44: executableSource,
    59: fortranSource,
    60: goSource,
    61: haskellSource,
    62: javaSource,
    63: javaScriptSource,
    64: luaSource,
    65: ocamlSource,
    66: octaveSource,
    67: pascalSource,
    68: phpSource,
    43: plainTextSource,
    69: prologSource,
    70: pythonSource,
    71: pythonSource,
    72: rubySource,
    73: rustSource,
    74: typescriptSource,
    75: cSource,
    76: cppSource,
    77: cobolSource,
    78: kotlinSource,
    79: objectiveCSource,
    80: rSource,
    81: scalaSource,
    82: sqliteSource,
    83: swiftSource,
    84: vbSource,
    85: perlSource,
    86: clojureSource,
    87: fsharpSource,
    88: groovySource,
    1001: cSource,
    1002: cppSource,
    1003: c3Source,
    1004: javaSource,
    1005: javaTestSource,
    1006: mpiccSource,
    1007: mpicxxSource,
    1008: mpipySource,
    1009: nimSource,
    1010: pythonForMlSource,
    1011: bosqueSource,
    1012: cppTestSource,
    1013: cSource,
    1014: cppSource,
    1015: cppTestSource,
    1021: csharpSource,
    1022: csharpSource,
    1023: csharpTestSource,
    1024: fsharpSource
};

/* A dictionary of file names. */
var fileNames = {
    45: "main.asm",
    46: "script.sh",
    47: "main.bas",
    48: "main.c",
    49: "main.c",
    50: "main.c",
    51: "Main.cs",
    52: "main.cpp",
    53: "main.cpp",
    54: "main.cpp",
    55: "script.lisp",
    56: "main.d",
    57: "script.exs",
    58: "main.erl",
    44: "a.out",
    59: "main.f90",
    60: "main.go",
    61: "main.hs",
    62: "Main.java",
    63: "script.js",
    64: "script.lua",
    65: "main.ml",
    66: "script.m",
    67: "main.pas",
    68: "script.php",
    43: "text.txt",
    69: "main.pro",
    70: "script.py",
    71: "script.py",
    72: "script.rb",
    73: "main.rs",
    74: "script.ts",
    75: "main.c",
    76: "main.cpp",
    77: "main.cob",
    78: "Main.kt",
    79: "main.m",
    80: "script.r",
    81: "Main.scala",
    82: "script.sql",
    83: "Main.swift",
    84: "Main.vb",
    85: "script.pl",
    86: "main.clj",
    87: "script.fsx",
    88: "script.groovy",
    1001: "main.c",
    1002: "main.cpp",
    1003: "main.c3",
    1004: "Main.java",
    1005: "MainTest.java",
    1006: "main.c",
    1007: "main.cpp",
    1008: "script.py",
    1009: "main.nim",
    1010: "script.py",
    1011: "main.bsq",
    1012: "main.cpp",
    1013: "main.c",
    1014: "main.cpp",
    1015: "main.cpp",
    1021: "Main.cs",
    1022: "Main.cs",
    1023: "Test.cs",
    1024: "script.fsx"
};

/* Creating a table of languageIds. */
var languageIdTable = {
    1001: 1,
    1002: 2,
    1003: 3,
    1004: 4,
    1005: 5,
    1006: 6,
    1007: 7,
    1008: 8,
    1009: 9,
    1010: 10,
    1011: 11,
    1012: 12,
    1013: 13,
    1014: 14,
    1015: 15,
    1021: 21,
    1022: 22,
    1023: 23,
    1024: 24
}

var extraApiUrl = "https://extra-ce.judge0.com";
/* Creating a table of language codes and their corresponding API URLs. */
var languageApiUrlTable = {
    1001: extraApiUrl,
    1002: extraApiUrl,
    1003: extraApiUrl,
    1004: extraApiUrl,
    1005: extraApiUrl,
    1006: extraApiUrl,
    1007: extraApiUrl,
    1008: extraApiUrl,
    1009: extraApiUrl,
    1010: extraApiUrl,
    1011: extraApiUrl,
    1012: extraApiUrl,
    1013: extraApiUrl,
    1014: extraApiUrl,
    1015: extraApiUrl,
    1021: extraApiUrl,
    1022: extraApiUrl,
    1023: extraApiUrl,
    1024: extraApiUrl
}

/* Creating a variable called inputs, which is an object. The object has a property called 54, which is
a string. */
var competitiveProgrammingInput = "\
3\n\
3 2\n\
1 2 5\n\
2 3 7\n\
1 3\n\
3 3\n\
1 2 4\n\
1 3 7\n\
2 3 1\n\
1 3\n\
3 1\n\
1 2 4\n\
1 3\n\
";

var inputs = {
    54: competitiveProgrammingInput
}

var competitiveProgrammingCompilerOptions = "-O3 --std=c++17 -Wall -Wextra -Wold-style-cast -Wuseless-cast -Wnull-dereference -Werror -Wfatal-errors -pedantic -pedantic-errors";

/* Creating a dictionary with key 54 and value competitiveProgrammingCompilerOptions. */
var compilerOptions = {
    54: competitiveProgrammingCompilerOptions
}