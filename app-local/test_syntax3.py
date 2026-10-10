import ast
code = '''
def test():
    try:
        with open("test.txt", "w") as f:
            if True:
                pass
            else:
                pass
    except Exception as e:
        print(e)
'''
ast.parse(code)
print('OK')