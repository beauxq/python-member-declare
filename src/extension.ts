// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('extension "python-member-declare" is now active');

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	// let disposable = vscode.commands.registerCommand('python-member-declare.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from python-member-declare!');
	// });

	// context.subscriptions.push(disposable);

	const collection = vscode.languages.createDiagnosticCollection('python-member-declare');
	if (vscode.window.activeTextEditor) {
		updateDiagnostics(vscode.window.activeTextEditor.document, collection);
	}
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			updateDiagnostics(editor.document, collection);
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(
		(document) => {
			updateDiagnostics(document, collection);
		}
	));
}

class PythonClass {
	name: string;
	startLine: number;
	/** indentation of "c" in "class" */
	indent: number;
	/** indentation of implementation (> indent, 0 means not set) */
	impIndent: number = 0;
	isSubclass: boolean = false;

	declared: Set<string> = new Set();

	constructor(name: string, startLine: number, indent: number) {
		this.name = name;
		this.startLine = startLine;
		this.indent = indent;
	}
}

const nameChars: ReadonlySet<number> = new Set([
	48, 49, 50, 51, 52, 53, 54, 55, 56, 57,  // 0-9
	65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,  // A-Z
	97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,  // a-z
	95  // "_"
]);

/**
 * valid character for a name in python
 */
function isValidNameChar(char: string, index: number = 0): boolean {
	const code = char.charCodeAt(index);

	return nameChars.has(code);
}

/**
 * assumes a python name starts at the beginning of this string
 * 
 * returns the python name
*/
function getName(str: string, startIndex: number): string {
	for (let i = startIndex; i < str.length; ++i) {
		if (! isValidNameChar(str, i)) {
			return str.substring(startIndex, i);
		}
	}
	return str.substring(startIndex);
}

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
	console.log("in updateDiagnostics");
	if (document && document.languageId === 'python') {
		console.log("found python document");

		const diags: vscode.Diagnostic[] = getDiagnostics(document);

		collection.set(document.uri, diags);
	} else {
		collection.clear();
	}
}

function getDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
	const classStack: PythonClass[] = [];

	const diags: vscode.Diagnostic[] = [];

	for (let lineNo = 0; lineNo < document.lineCount; ++lineNo) {
		const line = document.lineAt(lineNo);
		const indent = line.firstNonWhitespaceCharacterIndex;

		if (line.isEmptyOrWhitespace || line.text[indent] === "#") {
			continue;
		}
		// TODO: recognize when I'm in docstring """ and skip
		// TODO: handle everywhere that I'm in a string: `a = "self.c = 4"`

		while (classStack.length && indent <= classStack[classStack.length - 1].indent) {
			console.log(`finished class definition: ${classStack[classStack.length - 1].name} at line ${line.lineNumber}`);
			classStack.pop();
		}

		const trimmed = line.text.trimStart();
		if (trimmed.startsWith("class ")) {
			const name = getName(trimmed, 6);
			classStack.push(new PythonClass(name, line.lineNumber, indent));
			if ((trimmed.length > 6 + name.length + 1) &&
				(trimmed[6 + name.length] === '(') &&
				(trimmed[6 + name.length + 1] !== ')'))
			{
				classStack[classStack.length - 1].isSubclass = true;
			}
			console.log(`entering new class: ${name}`);
		}
		else { // not new class
			if (!classStack.length) {
				// line I don't care about because not in class definition
				continue;
			}
			const currentClass = classStack[classStack.length - 1];

			if (currentClass.impIndent === 0) {
				// first line of class implementation
				console.log(`class ${currentClass.name} indentation found at ${indent} on line ${lineNo}`);
				currentClass.impIndent = indent;
			}

			if (currentClass.isSubclass) {
				// then we don't know what members are declared
				continue;
			}

			if (indent === currentClass.impIndent) {
				// This is a place where class members could be declared
				const maybeMemberName = getName(trimmed, 0);
				const afterName = trimmed.substring(maybeMemberName.length).trimStart();
				if (afterName[0] === ":") {
					// this is a declaration
					console.log(`${currentClass.name}: found declared member name: ${maybeMemberName}`);
					currentClass.declared.add(maybeMemberName);
				}
			}
			else {  // not the base class implementation indentation (>)
				// look for assignment to class member
				let cursor = line.text.indexOf("self.");
				while (cursor < line.text.length && cursor !== -1) {
					let innerCursor = cursor + 5;
					const memberName = getName(line.text, innerCursor);
					innerCursor += memberName.length;
					// count "=" until something that's not whitespace or "="
					let eqCount = 0;
					while (innerCursor < line.text.length) {
						const char = line.text[innerCursor];
						if (char === "=") {
							++eqCount;
						}
						if (char !== "=" && char !== " " && char !== "\t") {
							break;
						}
						++innerCursor;
					}
					if (eqCount === 1) {
						console.log(`found assignment to member: ${memberName}`);
						if (!currentClass.declared.has(memberName)) {
							const diag = {
								code: '',
								message: `assigned to member ${memberName} of class ${currentClass.name} without declaring it`,
								range: new vscode.Range(
									new vscode.Position(line.lineNumber, cursor),
									new vscode.Position(line.lineNumber, innerCursor - 1)
								),
								severity: vscode.DiagnosticSeverity.Error,
								source: '',
								relatedInformation: [
									// new vscode.DiagnosticRelatedInformation(new vscode.Location(document.uri, new vscode.Range(new vscode.Position(1, 8), new vscode.Position(1, 9))), 'first assignment to `x`')
								]
							};
							diags.push(diag);
						}
					}

					cursor = line.text.indexOf("self.", innerCursor);
				}
			}
		}
	}
	return diags;
}

// this method is called when your extension is deactivated
export function deactivate() {}
