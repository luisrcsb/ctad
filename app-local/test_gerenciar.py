import ast
code = r'''
def gerenciar_startup(instalar: bool):
    import winreg
    exe_path = r"test.exe"
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    app_name = "CTAD-Upload-Auto"
    
    try:
        with open("test.txt", "w") as key:
            if True:
                pass
            else:
                try:
                    pass
                except FileNotFoundError:
                    pass
        except Exception as e:
            print(e)
'''
ast.parse(code)
print('OK')